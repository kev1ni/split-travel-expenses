-- =============================================================================
-- 여행경비 자동 정산 시스템 (Travel Expense Split System) Database Schema
-- 호환성: PostgreSQL 12+
-- 기반: 여행경비 자동 정산 DB 모식도 (8개 테이블 · 13개 관계)
--
-- ⚠️ 이 파일은 모든 테이블을 DROP 후 다시 만듭니다 (기존 데이터 삭제).
--    이미 데이터가 있는 DB는 sql/migrations/001_improvements.sql 을 실행하세요.
--
-- [v2 변경 요약]
--  - 코드 값(entry_type, split_type, status)을 소문자로 통일하고 CHECK 제약 추가
--  - 외화 금액(amount, exchanged_amount)을 NUMERIC(14,2)로 변경 (예: 12.50 USD 저장 가능)
--  - 환율(exchange_rate)을 TEXT -> NUMERIC(18,6)로 변경
--  - 날짜/금액/통화 코드 검증 CHECK, 같은 여행 내 닉네임 중복 방지 UNIQUE 추가
--  - 자주 조회하는 FK 컬럼 인덱스 추가, UNIQUE와 중복되는 인덱스 제거
-- =============================================================================

-- 기존 테이블 및 함수 삭제 (외래 키 종속성 고려 CASCADE 삭제)
DROP TABLE IF EXISTS SETTLEMENTS CASCADE;
DROP TABLE IF EXISTS EXPENSE_SPLITS CASCADE;
DROP TABLE IF EXISTS CARD_EVENTS CASCADE;
DROP TABLE IF EXISTS EXPENSES CASCADE;
DROP TABLE IF EXISTS CURRENCY_EXCHANGES CASCADE;
DROP TABLE IF EXISTS TRIP_MEMBERS CASCADE;
DROP TABLE IF EXISTS TRIPS CASCADE;
DROP TABLE IF EXISTS USERS CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;

-- -----------------------------------------------------------------------------
-- updated_at 자동 갱신 트리거 함수 (PostgreSQL 표준)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 1. USERS (사용자 계정)
-- 회원 기본 계정 정보를 관리합니다.
-- -----------------------------------------------------------------------------
CREATE TABLE USERS (
    id            SERIAL PRIMARY KEY,
    login_id      VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name          VARCHAR(50) NOT NULL,
    email         VARCHAR(100) NOT NULL UNIQUE
);

COMMENT ON TABLE USERS IS '사용자 계정 정보 테이블';
COMMENT ON COLUMN USERS.id IS '사용자 고유 식별자 (PK)';
COMMENT ON COLUMN USERS.login_id IS '로그인 아이디 (UK)';
COMMENT ON COLUMN USERS.password_hash IS '단방향 암호화된 비밀번호 해시';
COMMENT ON COLUMN USERS.name IS '사용자 실명';
COMMENT ON COLUMN USERS.email IS '이메일 주소 (UK)';

-- -----------------------------------------------------------------------------
-- 2. TRIPS (여행 프로젝트)
-- 생성된 여행 방(정산 세션) 정보를 관리합니다.
-- -----------------------------------------------------------------------------
CREATE TABLE TRIPS (
    id                   SERIAL PRIMARY KEY,
    title                VARCHAR(100) NOT NULL,
    description          TEXT,
    destination_country  VARCHAR(50),
    destination_currency CHAR(3) NOT NULL DEFAULT 'KRW',
    start_date           DATE,
    end_date             DATE,
    share_code           VARCHAR(50) UNIQUE,
    created_by           INTEGER NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_trips_created_by FOREIGN KEY (created_by) REFERENCES USERS (id) ON DELETE RESTRICT,
    CONSTRAINT ck_trips_dates CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date),
    CONSTRAINT ck_trips_currency CHECK (destination_currency ~ '^[A-Z]{3}$')
);

COMMENT ON TABLE TRIPS IS '여행 프로젝트(정산 세션) 테이블';
COMMENT ON COLUMN TRIPS.destination_currency IS '여행지 주 통화 코드 (ISO 4217, 예: JPY, USD)';
COMMENT ON COLUMN TRIPS.share_code IS '초대 및 웹 정산 화면 접근용 공유 코드 (UK)';

-- -----------------------------------------------------------------------------
-- 3. TRIP_MEMBERS (여행 참여자)
-- 여행(TRIPS)과 사용자(USERS)를 연결하는 매핑 테이블입니다.
-- 비회원(게스트) 참여자를 지원하기 위해 user_id는 NULL을 허용합니다.
-- -----------------------------------------------------------------------------
CREATE TABLE TRIP_MEMBERS (
    id       SERIAL PRIMARY KEY,
    trip_id  INTEGER NOT NULL,
    user_id  INTEGER, -- 비회원/게스트는 NULL 허용
    nickname VARCHAR(50) NOT NULL,
    CONSTRAINT fk_trip_members_trip FOREIGN KEY (trip_id) REFERENCES TRIPS (id) ON DELETE CASCADE,
    CONSTRAINT fk_trip_members_user FOREIGN KEY (user_id) REFERENCES USERS (id) ON DELETE SET NULL,
    CONSTRAINT uq_trip_members_trip_user UNIQUE (trip_id, user_id),
    CONSTRAINT uq_trip_members_trip_nickname UNIQUE (trip_id, nickname)
);

COMMENT ON TABLE TRIP_MEMBERS IS '여행 참여 멤버 매핑 테이블 (비회원 게스트 지원)';
COMMENT ON COLUMN TRIP_MEMBERS.user_id IS '참여 회원 ID (비회원 게스트일 경우 NULL)';

-- -----------------------------------------------------------------------------
-- 4. CURRENCY_EXCHANGES (환전 내역)
-- 여행 전/중 외화 환전 내역을 기록하여 기준 환율 추적에 활용합니다.
-- -----------------------------------------------------------------------------
CREATE TABLE CURRENCY_EXCHANGES (
    id                  SERIAL PRIMARY KEY,
    trip_id             INTEGER NOT NULL,
    member_id           INTEGER NOT NULL,
    exchange_date       DATE NOT NULL,
    currency            CHAR(3) NOT NULL,
    original_krw_amount INTEGER NOT NULL,
    exchanged_amount    NUMERIC(14, 2) NOT NULL,
    exchange_rate       NUMERIC(18, 6),
    rate_type           VARCHAR(50),
    memo                TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_currency_exchanges_trip FOREIGN KEY (trip_id) REFERENCES TRIPS (id) ON DELETE CASCADE,
    CONSTRAINT fk_currency_exchanges_member FOREIGN KEY (member_id) REFERENCES TRIP_MEMBERS (id) ON DELETE CASCADE,
    CONSTRAINT ck_currency_exchanges_amounts CHECK (original_krw_amount > 0 AND exchanged_amount > 0),
    CONSTRAINT ck_currency_exchanges_currency CHECK (currency ~ '^[A-Z]{3}$')
);

COMMENT ON TABLE CURRENCY_EXCHANGES IS '외화 환전 기록 테이블';

-- -----------------------------------------------------------------------------
-- 5. EXPENSES (지출 내역 - 핵심 마스터 테이블)
-- 여행 중 발생한 실제 지출 항목입니다.
-- -----------------------------------------------------------------------------
CREATE TABLE EXPENSES (
    id                  SERIAL PRIMARY KEY,
    trip_id             INTEGER NOT NULL,
    payer_member_id     INTEGER NOT NULL,
    entry_type          VARCHAR(50) NOT NULL DEFAULT 'manual',
    original_expense_id INTEGER, -- 수정/취소 시 원본 지출 참조 (자기참조 FK)
    title               VARCHAR(100) NOT NULL,
    category            VARCHAR(50) NOT NULL,
    amount              NUMERIC(14, 2) NOT NULL,
    currency            CHAR(3) NOT NULL DEFAULT 'KRW',
    exchange_rate       NUMERIC(18, 6),
    rate_date           DATE,
    krw_amount          INTEGER NOT NULL,
    payment_method      VARCHAR(50),
    split_type          VARCHAR(50) NOT NULL DEFAULT 'equal',
    spent_at            TIMESTAMPTZ NOT NULL,
    receipt_image_path  TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_expenses_trip FOREIGN KEY (trip_id) REFERENCES TRIPS (id) ON DELETE CASCADE,
    CONSTRAINT fk_expenses_payer FOREIGN KEY (payer_member_id) REFERENCES TRIP_MEMBERS (id) ON DELETE RESTRICT,
    CONSTRAINT fk_expenses_original FOREIGN KEY (original_expense_id) REFERENCES EXPENSES (id) ON DELETE SET NULL,
    CONSTRAINT ck_expenses_entry_type CHECK (entry_type IN ('manual', 'auto_card', 'correction', 'cancellation')),
    CONSTRAINT ck_expenses_split_type CHECK (split_type IN ('equal', 'exact', 'percentage')),
    CONSTRAINT ck_expenses_currency CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT ck_expenses_rate CHECK (exchange_rate IS NULL OR exchange_rate > 0)
);

COMMENT ON TABLE EXPENSES IS '여행 지출 마스터 테이블';
COMMENT ON COLUMN EXPENSES.entry_type IS '입력 경로 (manual: 수기입력, auto_card: 카드알림 연동, correction: 수정, cancellation: 취소)';
COMMENT ON COLUMN EXPENSES.split_type IS '분할 방식 (equal: 균등, exact: 금액 직접, percentage: 비율)';
COMMENT ON COLUMN EXPENSES.amount IS '현지 통화 기준 결제 금액 (소수 2자리까지)';
COMMENT ON COLUMN EXPENSES.original_expense_id IS '수정/취소 시 원본 지출 추적용 자기참조 FK';
COMMENT ON COLUMN EXPENSES.krw_amount IS '최종 정산의 기준이 되는 원화 환산액 (KRW)';

-- EXPENSES updated_at 트리거 연결
CREATE TRIGGER trg_expenses_updated_at
BEFORE UPDATE ON EXPENSES
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 6. CARD_EVENTS (카드 결제 원시 이벤트 로그 - 신규)
-- 카드 결제 문자(SMS), RCS, 앱 푸시 알림 등을 파싱하여 적재합니다.
-- 동일 결제가 2채널(RCS 1건 + 앱푸시 1건)로 중복 수신될 경우,
-- 2개의 CARD_EVENTS가 하나의 EXPENSES로 묶여 관리됩니다.
-- -----------------------------------------------------------------------------
CREATE TABLE CARD_EVENTS (
    event_id        VARCHAR(36) PRIMARY KEY,
    trip_id         INTEGER,
    payer_member_id INTEGER,
    expense_id      INTEGER,
    source          VARCHAR(50),
    message_format  VARCHAR(50),
    issuer          VARCHAR(50),
    event_type      VARCHAR(50),
    amount          TEXT,
    currency        CHAR(3) DEFAULT 'KRW',
    merchant        VARCHAR(100),
    approval_ref    VARCHAR(50),
    occurred_at     TIMESTAMPTZ,
    received_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_card_events_trip FOREIGN KEY (trip_id) REFERENCES TRIPS (id) ON DELETE SET NULL,
    CONSTRAINT fk_card_events_payer FOREIGN KEY (payer_member_id) REFERENCES TRIP_MEMBERS (id) ON DELETE SET NULL,
    CONSTRAINT fk_card_events_expense FOREIGN KEY (expense_id) REFERENCES EXPENSES (id) ON DELETE SET NULL
);

COMMENT ON TABLE CARD_EVENTS IS '카드 결제 원시 알림 이벤트 수신 로그 테이블';
COMMENT ON COLUMN CARD_EVENTS.approval_ref IS '카드 승인번호 (중복 결제 식별 키)';

-- -----------------------------------------------------------------------------
-- 7. EXPENSE_SPLITS (지출 분담 상세)
-- 특정 지출(EXPENSES)에 대해 각 멤버가 부담할 세부 분담 내역입니다.
-- -----------------------------------------------------------------------------
CREATE TABLE EXPENSE_SPLITS (
    id               SERIAL PRIMARY KEY,
    trip_id          INTEGER NOT NULL,
    expense_id       INTEGER NOT NULL,
    member_id        INTEGER NOT NULL,
    split_krw_amount INTEGER NOT NULL,
    percentage_bp    INTEGER NOT NULL DEFAULT 0 CHECK (percentage_bp BETWEEN 0 AND 10000),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_expense_splits_trip FOREIGN KEY (trip_id) REFERENCES TRIPS (id) ON DELETE CASCADE,
    CONSTRAINT fk_expense_splits_expense FOREIGN KEY (expense_id) REFERENCES EXPENSES (id) ON DELETE CASCADE,
    CONSTRAINT fk_expense_splits_member FOREIGN KEY (member_id) REFERENCES TRIP_MEMBERS (id) ON DELETE CASCADE,
    CONSTRAINT uq_expense_splits_expense_member UNIQUE (expense_id, member_id)
);

COMMENT ON TABLE EXPENSE_SPLITS IS '지출별 멤버 분담 내역 테이블';
COMMENT ON COLUMN EXPENSE_SPLITS.percentage_bp IS '분담 비율 (Basis Points: 10000 = 100.00%)';

-- -----------------------------------------------------------------------------
-- 8. SETTLEMENTS (최종 정산 및 송금 내역)
-- 여행 종료 또는 중간 정산 시 멤버 간 최종 송금 결과를 저장합니다.
-- -----------------------------------------------------------------------------
CREATE TABLE SETTLEMENTS (
    id                 SERIAL PRIMARY KEY,
    trip_id            INTEGER NOT NULL,
    sender_member_id   INTEGER NOT NULL,
    receiver_member_id INTEGER NOT NULL,
    amount             INTEGER NOT NULL,
    status             VARCHAR(20) NOT NULL DEFAULT 'pending',
    completed_at       TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_settlements_trip FOREIGN KEY (trip_id) REFERENCES TRIPS (id) ON DELETE CASCADE,
    CONSTRAINT fk_settlements_sender FOREIGN KEY (sender_member_id) REFERENCES TRIP_MEMBERS (id) ON DELETE RESTRICT,
    CONSTRAINT fk_settlements_receiver FOREIGN KEY (receiver_member_id) REFERENCES TRIP_MEMBERS (id) ON DELETE RESTRICT,
    CONSTRAINT ck_settlements_status CHECK (status IN ('pending', 'completed')),
    CONSTRAINT ck_settlements_members CHECK (sender_member_id <> receiver_member_id),
    CONSTRAINT ck_settlements_amount CHECK (amount > 0)
);

COMMENT ON TABLE SETTLEMENTS IS '최종 멤버 간 송금 정산 내역 테이블';
COMMENT ON COLUMN SETTLEMENTS.status IS '송금 상태 (pending: 대기, completed: 완료)';

-- -----------------------------------------------------------------------------
-- 인덱스 설정 (조회 및 조인 성능 최적화)
-- -----------------------------------------------------------------------------
-- share_code는 UNIQUE 제약이 자동으로 인덱스를 만들므로 별도 인덱스 불필요
CREATE INDEX idx_trips_created_by ON TRIPS(created_by);
CREATE INDEX idx_trip_members_trip ON TRIP_MEMBERS(trip_id);
CREATE INDEX idx_trip_members_user ON TRIP_MEMBERS(user_id);
CREATE INDEX idx_expenses_trip_spent ON EXPENSES(trip_id, spent_at);
CREATE INDEX idx_expenses_payer ON EXPENSES(payer_member_id);
CREATE INDEX idx_card_events_match ON CARD_EVENTS(approval_ref, issuer);
CREATE INDEX idx_card_events_expense ON CARD_EVENTS(expense_id);
CREATE INDEX idx_card_events_trip_received ON CARD_EVENTS(trip_id, received_at DESC);
CREATE INDEX idx_expense_splits_member ON EXPENSE_SPLITS(member_id);
CREATE INDEX idx_expense_splits_trip ON EXPENSE_SPLITS(trip_id);
CREATE INDEX idx_currency_exchanges_trip ON CURRENCY_EXCHANGES(trip_id, exchange_date);
CREATE INDEX idx_settlements_trip ON SETTLEMENTS(trip_id, status);

-- -----------------------------------------------------------------------------
-- (선택) 보안: Row Level Security
-- publishable key는 앱/웹에 노출돼도 되는 공개 키입니다. RLS가 꺼져 있으면 이 키만으로
-- 누구나 Supabase REST API로 USERS(비밀번호 해시 포함) 등을 직접 읽고 쓸 수 있습니다.
-- 백엔드 .env에 SUPABASE_SECRET_KEY(secret / service_role)를 넣은 뒤 아래를 실행하면,
-- Flask 서버만 DB에 접근하고 공개 키로는 접근할 수 없게 됩니다.
-- (publishable key만 쓰는 상태에서 실행하면 Flask도 접근이 막히니 주의)
-- -----------------------------------------------------------------------------
-- ALTER TABLE USERS              ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE TRIPS              ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE TRIP_MEMBERS       ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE CURRENCY_EXCHANGES ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE EXPENSES           ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE CARD_EVENTS        ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE EXPENSE_SPLITS     ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE SETTLEMENTS        ENABLE ROW LEVEL SECURITY;
