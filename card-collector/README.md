# 여행 카드 앱 푸시 수집

N빵트립은 선택한 카드 앱이 보내는 승인 푸시를 연결된 여행의 지출에 자동 등록한다. 결제자는 휴대폰 연결 시 선택한 멤버이고, 등록 시점의 여행 멤버 전원이 원화 금액을 균등 분담한다. 여행 화면을 닫아 두어도 서버가 처리한다.

## 갤럭시에서 시연하기

1. 같은 기기에 [N빵트립 APK](android/dist/travel-card-collector-debug.apk)와 [여행 결제 시연기 APK](android/dist/travel-demo-notifier-debug.apk)를 설치한다. 이전 N빵트립이 설치돼 있으면 업데이트한다.
2. N빵트립 0.5 이상에서 로그인한다. **내 여행**에서 원하는 여행의 **이 여행에 카드 연결**을 누르면 해당 여행 상세가 열린다. 결제자는 로그인한 계정의 여행 멤버로 지정된다.
3. 처음 한 번, 오른쪽 위 **카드 수집 설정 → 설치된 카드 앱 선택 → 여행 결제 시연기**를 고른다. **카드 앱 알림 접근 설정**에서 수집기를 허용한다. 실제 결제에 사용할 때는 해당 카드사 앱을 선택한다.
4. 시연기에서 통화·금액·사용처를 입력하고 테스트 결제 버튼을 누른다. 시연기 알림 권한을 처음 물으면 허용한다. 예를 들어 USD, 12.50, 공항 카페를 입력하면 해당 금액과 버튼을 누른 시각으로 승인 푸시가 뜬다.
5. N빵트립 **여행 상세 → 현금 · 카드 지출 내역**에서 등록된 지출을 확인한다. 이미 열어 둔 화면도 약 10초 간격으로 변경을 확인한다.

다른 여행을 열어도 수집 대상은 유지된다. 바꾸려면 **카드 수집 설정 → 수집할 여행 선택·변경**에서 새 여행의 **이 여행에 카드 연결**을 누른다. 앱을 다시 열면 로그인과 수집할 여행이 유지된다. 로그인 후 7일이 지나거나 로그아웃했을 때는 다시 로그인하고 여행을 선택한다. 0.4에서 업데이트한 경우에도 여행을 한 번 선택해야 한다. 이전에 직접 입력한 토큰으로 대기 중이던 지출은 기기에 보관한다.

수집기는 선택한 패키지의 공개 알림 제목과 본문을 읽는다. SMS와 채팅+ 수신 기능은 제거했다. 금액이 가려진 알림, 승인 거절, 인증번호, 여러 결제를 묶은 요약 알림은 건너뛴다. 현재 Android 파서는 KRW, JPY, USD, EUR를 처리한다. 카드사별로 실제 푸시 문구가 다를 수 있다. [Android 알림 리스너](https://developer.android.com/reference/android/service/notification/NotificationListenerService)

아이폰용 카드 앱 알림 자동화의 지원 버전, 설정 및 확인 절차는 [아이폰 설정](ios/README.md)에 있다.

## 수집 API

Android 앱은 로그인한 웹 세션으로 `POST /api/v1/trips/{trip_id}/collector-connection`을 호출해 해당 멤버의 수집용 토큰을 받는다. 사용자가 입력할 서버 주소나 토큰은 없다. 푸시를 전송할 때 서버가 해당 로그인 세션의 유효성과 여행 멤버 자격을 확인한다. 아이폰 단축어 및 기존 수동 연결은 `POST /api/collector/pair`와 서버 환경변수 `COLLECTOR_SIGNING_KEY`를 사용한다. 두 방식 모두 `POST /api/collector/events`에 `Authorization: Bearer <토큰>`과 구조화한 JSON을 보낸다.

```json
{
  "event_id": "b46e3781-e03f-4714-9061-1ab0afae51ae",
  "source": "app_push",
  "message_format": null,
  "issuer": "시연카드",
  "event_type": "approval",
  "amount": "12.50",
  "currency": "USD",
  "merchant": "공항 카페",
  "approval_ref": "00123456",
  "occurred_at": "2026-11-24T10:00:00+09:00",
  "received_at": "2026-11-24T10:00:01+09:00"
}
```

- 서버는 토큰으로 여행과 결제자를 지정하고 푸시, 지출, 멤버별 분담을 연결한다. 외화는 기준 환율로 환산하고 환율과 기준일을 지출에 기록한다. 환율을 받지 못하면 해당 푸시를 보관하고 재시도한다.
- 한 푸시를 재전송할 때는 같은 UUID와 본문을 유지한다. 서로 다른 푸시는 승인번호가 같아도 별개 지출로 등록한다. 취소는 원승인을 식별할 수 있을 때 원래 분담과 환율에 따라 차감한다.
- 알림에 없는 거래 시각·가맹점·승인번호는 `null`이다. 원문, 카드번호와 패키지명은 서버에 전송하지 않는다.
- 휴대폰에서 **최근 수집 결과**와 **대기 중인 전송 다시 시도**를 확인할 수 있다. 연결 정보가 없는 상태에서 수집한 푸시는 기기에만 보관한다. 기존 버전의 전송 대기 문자도 업데이트 후 기기에만 보관한다.

## 빌드와 검증

Android SDK 36과 JDK 17 이상을 준비한 뒤 `card-collector/android`에서 빌드한다.

```powershell
.\gradlew.bat :app:assembleDebug :app:lintDebug :demo-notifier:assembleDebug
```

깨끗한 Android 에뮬레이터에서 프로젝트 루트를 기준으로 아래 명령을 실행하면, 선택한 앱의 결제 푸시가 저장되고 SMS는 제외되는지 확인한다.

```powershell
python -X utf8 card-collector/tests/emulator_smoke.py --device emulator-5554 --apk card-collector/android/dist/travel-card-collector-debug.apk
```
