# 여행 카드 결제 수집기

휴대폰에서 사용자가 선택한 카드사의 승인·취소 알림을 읽고, 한 알림을 한 건의 JSON으로 만든다. 실물 카드로 결제해도 카드사가 문자 또는 푸시에 금액·통화를 표시하면 처리할 수 있다. 현금 지출은 웹에서 사용자가 입력한다.

여행 웹에서 **여행 → 카드 지출 → 휴대폰 수집기 연결**을 연다. 방장은 여행 멤버의 수집기를, 로그인한 결제자는 자신의 수집기를 연결할 수 있다. 선택한 결제자의 HTTPS 주소와 Bearer 토큰 값을 휴대폰에 입력한다. 새로운 결제가 **수신한 카드 알림**에 나타나면 **지출 검토**에서 금액과 분담 멤버를 확인하고 등록한다.

- **갤럭시**에서는 [시연용 APK](android/dist/travel-card-collector-debug.apk)를 설치한다. 문자·채팅+ 알림과 카드 앱 푸시를 선택할 수 있다.
- **아이폰**에서는 [NTrip 현대카드 전송](ios/배포용/NTrip%20현대카드%20전송.shortcut)을 파일 앱에서 열어 추가한 뒤 메시지 자동화를 연결한다. 현대 넥슨 국내 일시불 승인 문자에서 결제 금액과 가맹점을 추출해 전송한다. 서버 없이 금액만 확인하려면 [미리보기 단축어](ios/배포용/현대카드%20승인%20확인.shortcut)를 사용한다. [아이폰 설정 및 재전송](ios/README.md)

## 갤럭시에서 시연하기

1. [시연용 APK](android/dist/travel-card-collector-debug.apk)를 테스트 기기에 설치한다. USB 디버깅을 연결한 개발 PC에서 설치하려면 `adb install -r travel-card-collector-debug.apk`를 실행한다.
2. 카드사 이름에 **현대카드**를 입력한다. **문자·채팅+ 수신 경로**에서 실제 채팅+를 받는 **삼성 메시지 알림** 또는 **Google 메시지 알림**을 고른다. 예전 APK를 업데이트한 경우에도 이 경로를 선택하고 **설정 저장**을 누른다.
3. 카드사 대화 상세 화면에 표시되는 정확한 발신번호를 등록한다. 알림이 번호 없이 브랜드 이름만 보여주는 현대 넥슨 승인 양식이라면 알림의 발신자 표시명도 그대로 등록한다. 카드 앱 푸시까지 수집하려면 **설치된 카드 앱 선택**에서 현대카드 앱을 추가한다.
4. **메시지·카드 앱 알림 접근 설정**에서 여행 카드 수집기를 허용하고 **카드 알림 수집**을 켠다. 메시지 앱과 카드사 대화가 새 알림을 표시하도록 설정한다. 알림이 생기지 않거나 본문이 가려지면 해당 건은 자동 수집할 수 없다. **현대카드 채팅+ 예시 미리보기**는 알림 도착 없이 본문 해석만 확인하는 기능이다. [Android 알림 리스너](https://developer.android.com/reference/android/service/notification/NotificationListenerService)
5. 서버 주소와 토큰을 비워 두면 **기기 전용**으로 저장한다. **결과 새로고침 → 최근 JSON 공유**로 팀원에게 합성 예시를 전달할 수 있다. 웹에 연결하려면 **휴대폰 수집기 연결**에서 받은 전체 HTTPS 주소와 토큰 값을 앱에 저장한 뒤 새 알림을 받는다.

| 경로 | 이번 버전의 동작 |
|---|---|
| Android SMS 수신기 | 일반 SMS만 필요할 때 선택한다. SMS 수신 권한을 허용하면 등록한 번호에서 온 새 SMS를 처리한다. 메시지 앱 알림 경로를 쓰는 동안에는 같은 문자를 두 번 세지 않도록 이 수신기를 중지한다. [Android SMS 권한](https://developer.android.com/reference/android/Manifest.permission#RECEIVE_SMS) |
| Android 카드 앱 푸시 | 선택한 패키지의 공개된 알림 제목·본문을 읽는다. 요약 알림, 본문 미표시, 금액·통화 판별 불가 건은 건너뛴다. |
| 갤럭시 채팅+·문자 알림 | 선택한 메시지 앱이 게시한 알림에서 등록된 발신자의 승인·취소 본문을 자동 처리한다. 현대 넥슨 승인 예시는 1,400원과 예시마트샘플점으로 저장된다. 알림의 공통 메시지 정보로 SMS·MMS·RCS 전송방식을 구별할 수 없어서 `source="message"`, `message_format=null`을 보낸다. 지난 채팅+는 선택적으로 직접 추가할 수 있다. [Android 메시지 알림 데이터](https://developer.android.com/reference/android/app/Notification.MessagingStyle.Message) |
| iPhone | iOS 26은 선택한 발신자의 문자, iOS 27은 문자와 선택한 앱 푸시를 기본 단축어로 연결하도록 설정한다. 국내 현대 넥슨 승인 메시지 예시와 해외 JPY 합성 예시를 제공한다. [아이폰 단축어 설정 및 오프라인 시연](ios/README.md) |

Android 첫 버전의 통화는 KRW, JPY, USD, EUR다. 승인거절, 인증번호, 잔액 안내, 구분하기 어려운 복수 금액은 전송 대상에서 제외한다. 실제 카드사별 문구를 확보하면 승인·취소 케이스를 함께 추가해 검증한다.

## 수집 API와 웹에서 확인하기

웹은 계정 확인 후 `POST /api/collector/pair`로 해당 여행·결제자용 토큰을 받는다. 서버에는 `COLLECTOR_SIGNING_KEY`가 설정되어야 한다. 휴대폰의 전송 규약은 `POST https://〈팀 서버 도메인〉/api/collector/events`, `Authorization: Bearer <여행·결제자 토큰>`, `Content-Type: application/json`이다. 다음은 메시지 앱 알림에서 현대 넥슨 승인 건을 자동 수집하는 예다.

```json
{
  "event_id": "b46e3781-e03f-4714-9061-1ab0afae51ae",
  "source": "message",
  "message_format": null,
  "issuer": "현대카드",
  "event_type": "approval",
  "amount": "1400",
  "currency": "KRW",
  "merchant": "예시마트샘플점",
  "approval_ref": null,
  "occurred_at": null,
  "received_at": "2026-11-17T10:00:00+09:00"
}
```

- 같은 거래가 푸시로도 오면 새 UUID로 한 건을 추가한다. 이때 `source="app_push"`, `message_format=null`이다. 자체 수신 시각도 별도로 기록한다. 같은 알림 한 건의 **전송 재시도**에는 저장해 둔 UUID·JSON을 그대로 사용한다.
- 백엔드는 토큰에서 `trip_id`와 `payer_member_id`를 결정하고 `CARD_EVENTS` 테이블에 저장한다. 동일 이벤트 재수신에는 중복 생성 없이 2xx를 돌려준다. 별개 채널의 이벤트는 여행·결제자·카드사·승인번호 등으로 같은 거래임을 확인한 뒤 같은 지출에 연결한다. 두 번 연속 같은 금액을 쓴 경우도 있으므로 금액만으로 합치면 안 된다. 웹에서 승인 건을 확인하면 `EXPENSES`와 `EXPENSE_SPLITS`에 등록된다. 취소 알림은 **취소 검토**에서 원거래를 확인한 뒤 반영한다.
- `amount`는 원래 통화의 양수 십진 문자열이다. USD 12.50은 `"12.50"`로 보낸다. 환율 적용과 원화 정산은 백엔드에서 한다. 거래 시각·가맹점·승인번호가 불확실하면 해당 필드를 `null`로 둔다. 원문·카드번호·발신번호·앱 패키지명은 요청 본문에 넣지 않는다.
- Android 앱은 전송 전 기기에 구조화한 JSON을 보관한다. 실패 후에는 **대기 중인 전송 다시 시도**를 사용한다. 전송 확인에는 HTTP 2xx가 필요하다. 기기 전용으로 수집한 건은 나중에 서버를 설정해도 자동 전송하지 않는다. 다른 URL이나 토큰으로 바꾸면 기존 대기 건은 원래 설정을 복구할 때까지 대기한다.

## 개발 PC에서 실행하기

Android Studio에서 `android` 폴더를 연다. 또는 Android SDK 36과 Gradle 8.13 호환 JDK(17 또는 20)를 준비하고 아래 명령을 실행한다.

```powershell
cd card-collector/android
.\gradlew.bat :app:assembleDebug
```

Android 표준 에뮬레이터에서 수신 경로를 재현하려면 수집기를 설치한 적 없는 테스트용 AVD를 부팅한다. `adb`를 PATH에 두고 프로젝트 루트에서 아래 명령을 실행한다. `emulator-5554`는 해당 AVD의 ID로 바꾼다. 시험 코드는 디버그 APK를 설치하고 가상 발신번호와 테스트 푸시를 설정한 다음, 등록한 SMS와 푸시가 두 건으로 보관되는지 검사한다. 서버 주소는 비워 둔다.

```powershell
python -X utf8 card-collector/tests/emulator_smoke.py --device emulator-5554
```

Google 메시지 알림을 통한 자동 수집은 Google 메시지가 기본 문자 앱인 새 테스트 AVD에서 별도로 재현한다. 아래 스크립트는 현대 넥슨 예문을 가상 SMS로 보내고, Google 메시지가 게시한 알림에서 1,400원과 예시마트샘플점이 한 번만 저장되는지 검사한다. 다른 번호로 보낸 결제 예문이 제외되는지도 검사한다. 통신사 채팅+ 실수신은 현대카드 메시지를 받는 갤럭시에서 같은 설정으로 새 알림 한 건을 확인한다.

```powershell
python -X utf8 card-collector/tests/emulator_message_notification.py --device emulator-5554
```

아이폰 단축어의 합성 예시는 프로젝트 루트에서 `python -X utf8 card-collector/ios/demo_shortcut.py`로 시험할 수 있다. 이 스크립트는 단축어의 입력·출력 규칙을 흉내 낸다. iPhone에 설치하거나 알림을 수신하는 동작은 [실기기 설정 가이드](ios/README.md)에 있다.
