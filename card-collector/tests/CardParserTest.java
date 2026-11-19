package kr.trip.collector;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/** Synthetic fixtures. Run on the desktop JVM with the app's actual parser. */
public final class CardParserTest {
    private static int cases;
    private static final long RECEIVED = 1794882000000L;

    public static void main(String[] args) {
        Map<String, String> push = accept("테스트카드 해외승인",
                "결제금액: JPY 3,200\n가맹점: OSAKA MART\n승인번호: 0058210437",
                "approval", "3200", "JPY");
        Map<String, String> message = accept("[Web발신]", "테스트카드(1234) 해외승인\n홍*동님\n"
                + "3,200엔 일시불\n11/17 13:00 OSAKA MART\n누적 185,400원",
                "approval", "3200", "JPY");
        equal(push.get("amount"), message.get("amount"));
        equal("OSAKA MART", push.get("merchant"));
        equal("0058210437", push.get("approval_ref"));
        absent(message, "merchant", "approval_ref", "occurred_at");
        equal(new HashSet<>(Arrays.asList("event_type", "amount", "currency")), message.keySet());

        String nexon = "[Web발신]\n현대 넥슨 승인\n가*나\n1,400원 일시불\n03/12 08:25\n예시마트샘플점\n누적23,700원";
        for (String issuer : Arrays.asList("현대", "현대카드", "현대 넥슨")) {
            Map<String, String> event = accept(issuer, "메시지", nexon, "approval", "1400", "KRW");
            equal("예시마트샘플점", event.get("merchant"));
            absent(event, "occurred_at", "approval_ref");
        }
        Map<String, String> flattened = accept("현대카드", "메시지", nexon.replace('\n', ' '), "approval", "1400", "KRW");
        equal("예시마트샘플점", flattened.get("merchant"));
        absent(flattened, "occurred_at", "approval_ref");
        for (String unknownStore : Arrays.asList("가*나", "000-1234-0000", "1588-0000점", "누적한도점",
                "고객센터접수점", "가*나\n예시마트샘플점", "예시마트샘플점\n다른매장점", "예시마트샘플점 000-1234-0000")) {
            absent(accept("현대카드", "메시지", nexon.replace("예시마트샘플점", unknownStore), "approval", "1400", "KRW"),
                    "merchant", "occurred_at", "approval_ref");
        }
        absent(accept("다른카드", "메시지", nexon, "approval", "1400", "KRW"), "merchant");
        absent(accept("현대카드", "메시지", nexon.replace("현대 넥슨 승인", "현대 승인"), "approval", "1400", "KRW"), "merchant");
        absent(accept("현대카드", "메시지", nexon.replace("\n누적23,700원", ""), "approval", "1400", "KRW"), "merchant");

        accept(null, "카드 승인 12,500원 일시불 누적 1,500,000원", "approval", "12500", "KRW");
        accept("해외승인", "USD 12.5 수수료 USD 0.25", "approval", "12.50", "USD");
        accept("해외승인", "12.50 USD 원화 환산 18,000원", "approval", "12.50", "USD");
        accept("해외승인", "5,555円", "approval", "5555", "JPY");
        accept("결제완료", "10.00 유로", "approval", "10.00", "EUR");
        accept("Approved", "Purchase amount: €12.34 Balance EUR 987.66", "approval", "12.34", "EUR");
        accept("해외승인", "US$12.70", "approval", "12.70", "USD");
        accept("해외승인", "미국 달러 22", "approval", "22.00", "USD");
        accept("체크카드 사용", "KRW 3000\n잔액 9,000원", "approval", "3000", "KRW");
        accept("테스트카드승인", "원화 환산액: 14,000원 결제금액: USD 10", "approval", "10.00", "USD");
        accept("테스트카드승인", "누적:\n185,400원\n승인금액\nＪＰＹ ３，２００", "approval", "3200", "JPY");
        accept("테스트카드승인", "JPY 3,200\n승인금액: 3,200엔\n포인트: 120원", "approval", "3200", "JPY");

        accept("테스트카드 승인취소", "거래금액: 3,200엔", "cancel", "3200", "JPY");
        accept("테스트카드 해외 부분 취소", "원거래금액: USD 19.00 부분취소금액: USD -3.50",
                "cancel", "3.50", "USD");
        accept("테스트카드", "환불 완료 −500원\n잔액: 10,000원", "cancel", "500", "KRW");
        accept("Refunded", "Refund amount EUR 2.50 Original amount EUR 5.00", "cancel", "2.50", "EUR");

        Map<String, String> full = accept("카드 승인", "EUR 3.70\n거래일시: 2026-11-17T14:36:20+09:00\n"
                + "가맹점: TOKYO STORE 승인번호: 00123456", "approval", "3.70", "EUR");
        equal("TOKYO STORE", full.get("merchant"));
        equal("00123456", full.get("approval_ref"));
        equal("2026-11-17T14:36:20+09:00", full.get("occurred_at"));
        for (String unknown : Arrays.asList("11/17 14:36", "2026-11-17 14:36:20",
                "2026-02-30T14:36:20Z", "2026-11-17T30:12:15+09:00")) {
            absent(accept("승인", "USD 10\n거래일시: " + unknown, "approval", "10.00", "USD"), "occurred_at");
        }
        absent(accept("승인", "JPY 500\n가맹점: 1234-5678-9123-4567", "approval", "500", "JPY"), "merchant");
        absent(accept("승인", "JPY 500\n가맹점: sample@example.org", "approval", "500", "JPY"), "merchant");
        absent(accept("승인", "JPY 500\n승인번호: 4123456789012345", "approval", "500", "JPY"), "approval_ref");

        for (String text : Arrays.asList("체크카드 승인거절 1,000원", "승인 거부 1,000원", "결제실패 1,000원",
                "승인 대기 USD 5", "JPY 100 승인 요청", "승인불가 USD 10", "미승인 USD 10", "승인 한도초과 USD 10",
                "카드 승인 USD 10 인증번호: 012345", "승인 USD 10 [OTP]", "카드 승인 USD 10 비밀번호 확인",
                "[광고] 카드 승인 시 100원", "카드 사용 안내 100원", "자동납부 예정 USD 10",
                "승인 취소신청 100원", "취소 가능 1,000원", "승인 취소 문의 100원", "Declined: USD 20.00",
                "Pending refund: USD 5.00", "Balance USD 9.99", "친구야 10,000원 보내줘", "승인번호 123456 USD 10",
                "승인 누적 100,000원", "승인\n잔액:\n10,000원", "승인\n한도 5,000원 포인트 300원",
                "승인 누계 15,000원", "승인 환산 3,000원", "승인 원거래금액: 3,000엔",
                "승인 3,200", "승인 $12.50", "승인 ¥3,200", "승인 THB 80\n환산 3,290원",
                "승인 THB 80 (3,290원)", "승인 50달러 (KRW 45,000)", "승인 ¥3,200 (32,000원)",
                "승인을 위해 USD 100", "승인내역 합계 18,000원",
                "승인 3,00엔", "승인 3.4엔", "승인 0원", "승인 USD -4.00", "승인 -USD 4.00",
                "승인 USD 4.123", "승인 USD 9,999,999,999,999,999,999",
                "승인 JPY 3,200 USD 20.00", "승인 500원 800원")) {
            reject(null, text);
        }
        reject(null, null);
        reject("", "");
        if (CardParser.parse(" ", "승인", "12,500원", RECEIVED) != null) fail("empty issuer");
        cases++;
        char[] fill = new char[8300];
        Arrays.fill(fill, 'x');
        reject("승인", "12,500원 " + new String(fill));
        System.out.println("CardParser: " + cases + " synthetic cases passed");
    }

    private static Map<String, String> accept(String title, String body, String kind, String amount, String currency) {
        return accept("테스트카드", title, body, kind, amount, currency);
    }

    private static Map<String, String> accept(String issuer, String title, String body, String kind, String amount, String currency) {
        Map<String, String> event = CardParser.parse(issuer, title, body, RECEIVED);
        if (event == null) fail("unexpected rejection in synthetic case " + (cases + 1));
        equal(kind, event.get("event_type"));
        equal(amount, event.get("amount"));
        equal(currency, event.get("currency"));
        Set<String> allowed = new HashSet<>(Arrays.asList("event_type", "amount", "currency",
                "merchant", "approval_ref", "occurred_at"));
        if (!allowed.containsAll(event.keySet())) fail("unexpected data in result");
        cases++;
        return event;
    }

    private static void reject(String title, String body) {
        if (CardParser.parse("테스트카드", title, body, RECEIVED) != null) {
            fail("unexpected acceptance in synthetic case " + (cases + 1));
        }
        cases++;
    }

    private static void absent(Map<String, String> result, String... keys) {
        for (String key : keys) if (result.containsKey(key)) fail("unexpected field " + key);
    }

    private static void equal(Object expected, Object actual) {
        if (!expected.equals(actual)) fail("expected " + expected + ", got " + actual + " near case " + cases);
    }

    private static void fail(String detail) {
        throw new AssertionError(detail);
    }
}
