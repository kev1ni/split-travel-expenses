# iPhone에서 카드 앱 푸시 연결하기

iOS 27부터 단축어의 **알림(Notification)** 트리거에서 카드사 앱 한 개를 선택할 수 있다. iOS 26에는 이 트리거가 없다. 이 프로젝트의 수집 경로는 선택한 앱의 승인·취소 푸시다. iOS 26에서는 여행 웹에서 지출을 직접 입력할 수 있다. [Apple의 iOS 27 알림 트리거](https://support.apple.com/en-by/guide/shortcuts/apd932ff833f/10.0/ios/27) · [Apple WWDC26 시연](https://developer.apple.com/videos/play/wwdc2026/310/)

**현재 검증 범위**는 Windows에서의 단축어 파일 생성과 예시 푸시 파싱, 전송 데이터, 재시도다. iPhone 실기기 수신·잠금 실행·서명본 설치는 검증 전이다. 현대카드에서 받은 실제 예시는 채팅+ 문자였고, 현대카드 **앱 푸시** 문구는 아직 확보하지 못했다.

## 팀원이 서명본 준비하기

저장소의 [단축어 원본](source/NTrip%20카드%20앱%20푸시%20전송.shortcut)은 서명 전 파일이다. Mac에서 저장소 루트 기준으로 아래 명령을 실행해 배포용 파일을 만든다. 팀원에게는 주소·토큰·카드사 이름이 비어 있는 서명본을 보낸다. [Apple의 단축어 서명 방법](https://support.apple.com/guide/shortcuts-mac/run-shortcuts-from-the-command-line-apd455c82f02/10.0/mac/27)

```sh
cd card-collector/ios
shortcuts sign --mode anyone --input "source/NTrip 카드 앱 푸시 전송.shortcut" --output "NTrip 카드 앱 푸시 전송-signed.shortcut"
```

## iOS 27에서 한 번 설정하기

1. 여행 웹에서 **휴대폰 수집기 연결**을 열어 여행과 결제자를 선택하고 전체 HTTPS 수신 주소 및 개인 토큰을 발급한다.
2. iPhone의 파일 앱에서 서명본을 열어 단축어에 추가한다. 설정 질문에 수신 주소, 토큰 값, 자동화에 사용할 카드사 이름을 입력한다.
3. 단축어 앱에서 **새 단축어 → 편집 → 자동화 → 알림 → 앱**으로 들어가 실제 카드사 앱을 선택한다. 이 자동화에 **단축어 실행** 동작을 추가하고 `NTrip 카드 앱 푸시 전송`을 지정한다. 입력에는 **수신한 알림 변수의 본문**을 넣는다. 승인·취소가 제목에만 있다면 **텍스트** 동작에서 해당 제목과 본문을 줄바꿈으로 이어 전송기의 입력으로 사용한다. 카드사마다 하나씩 설정한다. [Apple의 자동화 설정](https://support.apple.com/en-ae/guide/shortcuts/apdfbdbd7123/10.0/ios/27)
4. 실제 푸시를 받을 수 있는 테스트 여행에서 잠금을 해제한 상태로 파일 저장 및 서버 연결 권한을 허용한다. 지원 형식의 승인 푸시가 오면 여행 **지출 내역**에서 가맹점, 통화, 금액과 결제자를 확인한다. 잠긴 상태에서 시연할 경우 단축어의 개인정보 보호 설정과 실제 푸시 한 건으로 별도 확인한다. [Apple의 잠금 중 실행 설정](https://support.apple.com/en-ae/guide/shortcuts/apdfbdbd7123/10.0/ios/27)

## 인식하는 푸시 본문

아래는 자동화 입력의 **합성 예시**다. 첫 줄은 승인·취소와 금액을 담고, 다음에는 가맹점이 온다. 승인번호는 선택 항목이다. 공백이나 줄바꿈으로 구분할 수 있다.

```text
해외승인 JPY 3,200
가맹점: SORA MART
승인번호: 00123456
```

```text
국내승인
결제금액: 1,400원
가맹점: 시연 편의점
```

USD·EUR은 소수 둘째 자리, JPY·KRW는 정수 금액을 처리한다. 취소는 `취소` 또는 `승인취소`가 표시된 양식을 처리한다. 인식하지 못하는 형식이나 결제 정보가 가려진 푸시는 전송을 건너뛴다. 카드사별 지원을 추가할 때는 해당 앱 푸시의 제목과 본문을 개인정보를 가려 확보한 뒤 [파서](build_sender.py)와 [테스트](test_sender.py)에 추가한다.

## 재전송과 검증

수신 건마다 새 `event_id`를 발급하고 서버에 보내기 전에 정규화한 결제 정보만 `Shortcuts/NTrip-<event_id>.txt`에 저장한다. 동일 승인번호의 별도 푸시 두 건도 각각 새 수신 건이다. 서버 응답을 받지 못했을 때는 **파일 선택 → 입력에서 텍스트 가져오기 → 단축어 실행**으로 원래 대기 파일을 같은 전송기에 전달한다. 재전송에는 처음과 동일한 주소·결제자 토큰·카드사 설정이 필요하다. 수신을 확인한 파일은 지울 수 있다.

로컬 검사는 Windows의 ICU로 생성된 단축어 동작을 읽어 예시 푸시와 제외할 입력을 검사한다. 파일·HTTP는 모의 실행한다. 저장소 루트에서 실행한다.

```powershell
python -X utf8 card-collector/ios/build_sender.py
python -X utf8 card-collector/ios/test_sender.py -v
```
