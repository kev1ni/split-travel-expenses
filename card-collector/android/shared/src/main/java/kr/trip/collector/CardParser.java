package kr.trip.collector;

import java.math.BigDecimal;
import java.text.Normalizer;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Parses the displayed text of an already allowlisted issuer. Returns null for ambiguous alerts. */
public final class CardParser {
    private static final int CI = Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE;
    private static final Pattern IGNORE = Pattern.compile(
            "광고|쿠폰|이벤트\\s*(참여|응모)|인증\\s*(번호|코드)|일회용|본인\\s*확인|비밀번호"
            + "|(?:승인|결제|거래)\\s*(거절|거부|실패|요청|대기|예정)|한도\\s*초과|잔액\\s*부족"
            + "|미승인|승인\\s*불가|승인을\\s*위해|이용\\s*대금|자동\\s*납부\\s*예정|연회비\\s*안내"
            + "|명세서|이용\\s*실적|승인\\s*내역\\s*(?:합계|조회)|취소\\s*시\\b"
            + "|(?:취소|환불)\\s*(요청|신청|예정|가능|문의|거절|실패|대기)|(?:승인|결제|취소|환불)되지"
            + "|\\b(?:OTP|declined|denied|failed|pending|verification|passcode|one.time|promotion)\\b", CI);
    private static final Pattern CANCELLATION = Pattern.compile(
            "(?:부분\\s*)?(?:취소|환불)(?:\\s*(?:승인|완료|금액)|(?=[\\s\\p{Punct}원0-9]|$))"
            + "|(?:취소|환불)(?:됐|되었)|\\b(?:refunded|refund|reversed|reversal|voided)\\b", CI);
    private static final Pattern APPROVAL = Pattern.compile(
            "승인(?!\\s*(?:번호|코드|율|일시|시각))|결제\\s*(?:완료|되었|됐)"
            + "|(?:체크|신용)\\s*카드\\s*사용(?=[\\s\\p{Punct}0-9]|$)|\\b(?:approved|purchased)\\b", CI);

    // A single alert can also quote the balance, available credit and the original purchase price.
    private static final String AUX_LABEL =
            "(?<![0-9])원(?:거래|승인|결제)\\s*(?:금액)?|취소\\s*전\\s*금액|기존\\s*(?:승인|결제)\\s*금액"
            + "|(?:총\\s*)?누[적계]|잔액|잔여(?:한도)?|한도|가능액|이용가능|사용가능|출금가능"
            + "|포인트|캐시백|할인(?:액|금)?|수수료|(?:원화\\s*)?환산|청구예상|결제예정액"
            + "|\\b(?:balance|available(?: credit)?|cashback|fee|reward points|original amount)\\b";
    private static final String TRANSACTION_LABEL =
            "(?:결제|승인|거래|이용|사용|취소|환불)\\s*금액|일시불"
            + "|\\b(?:transaction amount|purchase amount|refund amount)\\b";
    private static final Pattern LABEL = Pattern.compile("(" + AUX_LABEL + ")|" + TRANSACTION_LABEL, CI);
    // Unqualified symbols and other currency codes mark a segment ambiguous even if another amount matched.
    private static final String UNIT = "(?:US\\$|USD|JPY|EUR|KRW|미국\\s*달러|미화|유로|엔|円|원|₩|€"
            + "|(?-i:[A-Z]{3})|[$¥£₹元]|달러|위안|바트|파운드|프랑)";
    private static final String NUMBER = "[+-]?(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\\.[0-9]+)?";
    private static final Pattern MONEY = Pattern.compile(
            "(?<![a-z0-9+-])(" + UNIT + ")[ \\t]*(" + NUMBER + ")(?![a-z0-9]|[.,][0-9])"
            + "|(?<![a-z0-9+.,-])(" + NUMBER + ")[ \\t]*(" + UNIT + ")(?![a-z])", CI);
    private static final Pattern MERCHANT = Pattern.compile(
            "(?:^|[\\s|])(?:가맹점(?:명)?|사용처|이용처|merchant)[ \\t]*[:=][ \\t]*([^\\n|•;]{1,120})", CI);
    private static final Pattern HYUNDAI_ISSUER = Pattern.compile("현대(?:\\s*(?:카드|넥슨))?");
    // For this issuer layout, the branch name sits between a short local time and the cumulative total.
    private static final Pattern HYUNDAI_NEXON_STORE = Pattern.compile(
            "(?:^|\\n)[ \\t]*(?:\\[Web발신\\]\\s*)?현대\\s+넥슨\\s+승인\\s+"
            + "[가-힣][*●]+[가-힣](?:님)?\\s+[0-9][0-9,]*원\\s+일시불\\s+"
            + "(?:0[1-9]|1[0-2])/(?:0[1-9]|[12][0-9]|3[01])\\s+(?:[01][0-9]|2[0-3]):[0-5][0-9]\\s+"
            + "([가-힣A-Za-z0-9][가-힣A-Za-z0-9 .()&·-]{0,58}(?:점|마트|약국|식당|카페|주유소))"
            + "\\s+누적[ \\t]*[0-9][0-9,]*원\\.?\\s*\\z");
    private static final Pattern NON_STORE = Pattern.compile(
            "누적|한도|잔액|승인번호|전화|고객센터|[0-9]{2,}[ .()-]*[0-9]{3,}");
    private static final Pattern NEXT_FIELD = Pattern.compile(
            "[ \\t]+(?=(?:승인|취소|결제|거래|이용|사용|누적|잔액|한도|일시불|원거래|수수료|포인트"
            + "|approval|amount|balance|card number))", CI);
    private static final Pattern REF = Pattern.compile(
            "(?:승인[ \\t]*번호|approval[ \\t]*(?:ref(?:erence)?|no\\.?))[ \\t:#=]*([0-9]{6,12})(?![0-9])", CI);
    private static final Pattern PRIVATE_NUMBER = Pattern.compile("(?:[0-9][ -]?){9,}");
    private static final Pattern TIME = Pattern.compile(
            "(?:거래|승인|결제|취소)(?:일시|시각|시간)[ \\t:=]*"
            + "([0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}(?::[0-9]{2})?(?:Z|[+-][0-9]{2}:[0-9]{2}))");

    private CardParser() {}

    /** receivedMs identifies receipt time for the caller; it never supplies a missing transaction time. */
    public static Map<String, String> parse(String issuer, String title, String body, long receivedMs) {
        if (issuer == null || issuer.trim().isEmpty()) return null;
        String input = (title == null ? "" : title) + "\n" + (body == null ? "" : body);
        if (input.length() > 8192) return null;
        String text = Normalizer.normalize(input, Normalizer.Form.NFKC).replace('\r', '\n').replace('−', '-');
        if (IGNORE.matcher(text).find()) return null;
        boolean cancel = CANCELLATION.matcher(text).find();
        if (!cancel && !APPROVAL.matcher(text).find()) return null;

        Money result = new Money(cancel);
        boolean pendingAux = false;
        for (String line : text.split("\\n")) {
            if (line.trim().isEmpty()) continue;
            boolean auxiliary = pendingAux;
            Matcher labels = LABEL.matcher(line);
            int start = 0;
            while (labels.find()) {
                if (!auxiliary) result.read(line.substring(start, labels.start()));
                auxiliary = labels.group(1) != null;
                start = labels.end();
            }
            String rest = line.substring(start);
            if (!auxiliary) result.read(rest);
            pendingAux = auxiliary && rest.matches("[\\s:=]*");
        }
        if (result.amount == null || result.ambiguous) return null;

        Map<String, String> event = new LinkedHashMap<>();
        event.put("event_type", cancel ? "cancel" : "approval");
        event.put("amount", result.amount);
        event.put("currency", result.currency);
        Matcher merchant = MERCHANT.matcher(text);
        if (merchant.find()) {
            String name = NEXT_FIELD.split(merchant.group(1), 2)[0].trim();
            if (!name.isEmpty() && name.length() <= 80 && !name.contains("@")
                    && !PRIVATE_NUMBER.matcher(name).find()) {
                event.put("merchant", name);
            }
        } else if (!cancel && HYUNDAI_ISSUER.matcher(issuer.trim()).matches()) {
            Matcher store = HYUNDAI_NEXON_STORE.matcher(text);
            if (store.find() && !NON_STORE.matcher(store.group(1)).find()) {
                event.put("merchant", store.group(1));
            }
        }
        Matcher ref = REF.matcher(text);
        if (ref.find()) event.put("approval_ref", ref.group(1));
        Matcher time = TIME.matcher(text);
        if (time.find()) {
            try {
                OffsetDateTime t = OffsetDateTime.parse(time.group(1).replace(' ', 'T'));
                event.put("occurred_at", t.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
            } catch (DateTimeParseException ignored) {
                // Keep only date/time values that can be established from the alert itself.
            }
        }
        return event;
    }

    private static String currency(String unit) {
        switch (unit.toUpperCase(Locale.ROOT).replaceAll("\\s+", "")) {
            case "JPY": case "엔": case "円": return "JPY";
            case "USD": case "US$": case "미화": case "미국달러": return "USD";
            case "EUR": case "유로": case "€": return "EUR";
            case "KRW": case "원": case "₩": return "KRW";
            default: return null;
        }
    }

    private static final class Money {
        final boolean cancel;
        String currency;
        String amount;
        boolean ambiguous;

        Money(boolean cancel) { this.cancel = cancel; }

        void read(String segment) {
            Matcher m = MONEY.matcher(segment);
            while (m.find()) {
                boolean prefix = m.group(1) != null;
                String unit = currency(prefix ? m.group(1) : m.group(4));
                String digits = (prefix ? m.group(2) : m.group(3)).replace(",", "");
                if (unit == null || digits.length() > 20) {
                    ambiguous = true;
                    continue;
                }
                BigDecimal value = new BigDecimal(digits);
                int precision = unit.equals("USD") || unit.equals("EUR") ? 2 : 0;
                if (value.signum() == 0 || (!cancel && value.signum() < 0)
                        || value.scale() > 2 || value.stripTrailingZeros().scale() > precision
                        || value.abs().movePointRight(precision).compareTo(BigDecimal.valueOf(Long.MAX_VALUE)) > 0) {
                    ambiguous = true;
                    continue;
                }
                String normalized = value.abs().setScale(precision).toPlainString();
                if (amount != null && (!normalized.equals(amount) || !unit.equals(currency))) ambiguous = true;
                amount = normalized;
                currency = unit;
            }
        }
    }
}
