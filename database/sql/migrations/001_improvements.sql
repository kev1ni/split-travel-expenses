-- =============================================================================
-- migration_001_improvements.sql
-- 기존 데이터를 유지한 채 schema.sql v2 변경사항을 적용합니다.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요. (한 트랜잭션으로 실행)
--
-- 실행 전 확인:
--  * exchange_rate 컬럼에 숫자가 아닌 값(예: '9.1원')이 있으면 3단계에서 실패합니다.
--    SELECT id, exchange_rate FROM expenses WHERE exchange_rate !~ '^\s*[0-9.]+\s*$';
--  * 같은 여행에 같은 닉네임이 두 명 이상 있으면 5단계에서 실패합니다.
--    SELECT trip_id, nickname, COUNT(*) FROM trip_members GROUP BY 1, 2 HAVING COUNT(*) > 1;
-- =============================================================================
BEGIN;

-- 1) 코드 값 소문자 통일 -------------------------------------------------------
UPDATE expenses    SET entry_type = lower(entry_type) WHERE entry_type <> lower(entry_type);
UPDATE expenses    SET split_type = lower(split_type) WHERE split_type <> lower(split_type);
UPDATE expenses    SET split_type = 'exact' WHERE split_type IN ('custom', 'amount');
UPDATE settlements SET status     = lower(status)     WHERE status     <> lower(status);

ALTER TABLE expenses    ALTER COLUMN entry_type SET DEFAULT 'manual';
ALTER TABLE expenses    ALTER COLUMN split_type SET DEFAULT 'equal';
ALTER TABLE settlements ALTER COLUMN status     SET DEFAULT 'pending';

-- 2) 외화 금액 소수 지원 (INTEGER -> NUMERIC) ----------------------------------
ALTER TABLE expenses           ALTER COLUMN amount           TYPE NUMERIC(14, 2);
ALTER TABLE currency_exchanges ALTER COLUMN exchanged_amount TYPE NUMERIC(14, 2);

-- 3) 환율 TEXT -> NUMERIC ------------------------------------------------------
ALTER TABLE expenses ALTER COLUMN exchange_rate TYPE NUMERIC(18, 6)
    USING NULLIF(trim(exchange_rate), '')::NUMERIC;
ALTER TABLE currency_exchanges ALTER COLUMN exchange_rate TYPE NUMERIC(18, 6)
    USING NULLIF(trim(exchange_rate), '')::NUMERIC;

-- 4) CHECK 제약 ----------------------------------------------------------------
ALTER TABLE trips ADD CONSTRAINT ck_trips_dates
    CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date);
ALTER TABLE trips ADD CONSTRAINT ck_trips_currency CHECK (destination_currency ~ '^[A-Z]{3}$');

ALTER TABLE currency_exchanges ADD CONSTRAINT ck_currency_exchanges_amounts
    CHECK (original_krw_amount > 0 AND exchanged_amount > 0);
ALTER TABLE currency_exchanges ADD CONSTRAINT ck_currency_exchanges_currency CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE expenses ADD CONSTRAINT ck_expenses_entry_type
    CHECK (entry_type IN ('manual', 'auto_card', 'correction', 'cancellation'));
ALTER TABLE expenses ADD CONSTRAINT ck_expenses_split_type
    CHECK (split_type IN ('equal', 'exact', 'percentage'));
ALTER TABLE expenses ADD CONSTRAINT ck_expenses_currency CHECK (currency ~ '^[A-Z]{3}$');
ALTER TABLE expenses ADD CONSTRAINT ck_expenses_rate CHECK (exchange_rate IS NULL OR exchange_rate > 0);

ALTER TABLE expense_splits ADD CONSTRAINT ck_expense_splits_bp CHECK (percentage_bp BETWEEN 0 AND 10000);

ALTER TABLE settlements ADD CONSTRAINT ck_settlements_status CHECK (status IN ('pending', 'completed'));
ALTER TABLE settlements ADD CONSTRAINT ck_settlements_members CHECK (sender_member_id <> receiver_member_id);
ALTER TABLE settlements ADD CONSTRAINT ck_settlements_amount CHECK (amount > 0);

-- 5) 같은 여행 내 닉네임 중복 방지 ---------------------------------------------
ALTER TABLE trip_members ADD CONSTRAINT uq_trip_members_trip_nickname UNIQUE (trip_id, nickname);

-- 6) 인덱스 정리 ---------------------------------------------------------------
DROP INDEX IF EXISTS idx_trips_share_code;  -- UNIQUE 제약 인덱스와 중복
CREATE INDEX IF NOT EXISTS idx_trips_created_by            ON trips(created_by);
CREATE INDEX IF NOT EXISTS idx_card_events_expense         ON card_events(expense_id);
CREATE INDEX IF NOT EXISTS idx_card_events_trip_received   ON card_events(trip_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_expense_splits_trip         ON expense_splits(trip_id);
CREATE INDEX IF NOT EXISTS idx_currency_exchanges_trip     ON currency_exchanges(trip_id, exchange_date);
DROP INDEX IF EXISTS idx_settlements_trip;
CREATE INDEX IF NOT EXISTS idx_settlements_trip            ON settlements(trip_id, status);

-- 7) 중복 생성된 pending 정산 정리 (기존 코드는 /settle 호출마다 새로 INSERT 했음)
--    완료(completed)된 건은 남기고 대기(pending) 건만 지웁니다. 이후 /settle을 한 번 다시 호출하세요.
DELETE FROM settlements WHERE status = 'pending';

COMMIT;

-- 8) (선택) RLS 활성화 — .env를 SUPABASE_SECRET_KEY로 바꾼 뒤에만 실행하세요.
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;  ... (schema.sql 하단 참고)
