package kr.trip.demo.notifier;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.widget.EditText;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.text.Normalizer;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Arrays;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

import kr.trip.collector.CardParser;

public final class MainActivity extends Activity {
    private static final String CHANNEL = "demo_payments";
    private static final String TITLE = "여행 결제 시연기 · 테스트 결제 승인";
    private static final int NOTIFICATION_PERMISSION = 1;
    private static final Pattern AMOUNT = Pattern.compile("(?:[0-9]{1,12}|[0-9]{1,3}(?:,[0-9]{3}){1,3})(?:\\.[0-9]{1,2})?");
    private Spinner currency;
    private EditText amount;
    private EditText merchant;
    private TextView status;
    private SharedPreferences prefs;
    private long pendingPermissionTime;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(R.layout.demo_payment);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            int lightBars = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                    | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            getWindow().getInsetsController().setSystemBarsAppearance(lightBars, lightBars);
            ScrollView scroll = findViewById(R.id.scroll);
            scroll.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars()
                        | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return insets;
            });
        }
        getSystemService(NotificationManager.class).createNotificationChannel(
                new NotificationChannel(CHANNEL, "테스트 결제", NotificationManager.IMPORTANCE_HIGH));
        prefs = getSharedPreferences("demo", MODE_PRIVATE);
        currency = findViewById(R.id.currency);
        amount = findViewById(R.id.amount);
        merchant = findViewById(R.id.merchant);
        status = findViewById(R.id.status);
        // Offer a numeric keyboard without stripping commas, negative signs or pasted text before validation.
        amount.setRawInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        String[] currencies = getResources().getStringArray(R.array.currencies);
        int selection = Arrays.asList(currencies).indexOf(prefs.getString("currency", "KRW"));
        currency.setSelection(Math.max(0, selection));
        amount.setText(prefs.getString("amount", "1400"));
        merchant.setText(prefs.getString("merchant", "예시마트"));
        if (state != null) pendingPermissionTime = state.getLong("permission_time");
        findViewById(R.id.send).setOnClickListener(v -> sendPayment(System.currentTimeMillis()));
    }

    private void sendPayment(long paidAt) {
        String code = currency.getSelectedItem().toString();
        String rawAmount = amount.getText().toString().trim();
        int precision = code.equals("USD") || code.equals("EUR") ? 2 : 0;
        status.setText("");
        if (!AMOUNT.matcher(rawAmount).matches() || (precision == 0 && rawAmount.contains("."))) {
            invalid(amount, precision == 0 ? "이 통화는 12자리 이내 정수로 입력해 주세요."
                    : "정수 12자리, 소수점 둘째 자리까지 입력할 수 있어요.");
            return;
        }
        BigDecimal value = new BigDecimal(rawAmount.replace(",", "")).setScale(precision);
        if (value.signum() <= 0) {
            invalid(amount, "0보다 큰 금액을 입력해 주세요.");
            return;
        }
        String store = Normalizer.normalize(merchant.getText().toString(), Normalizer.Form.NFKC).trim();
        if (store.isEmpty() || store.length() > 80 || store.codePoints().anyMatch(Character::isISOControl)) {
            invalid(merchant, "사용처를 한 줄로 1~80자 입력해 주세요.");
            return;
        }

        long last = prefs.getLong("last_reference", 0);
        long reference = last == 0 ? 100_000_000L + new SecureRandom().nextInt(900_000_000) : last + 1;
        OffsetDateTime localTime = Instant.ofEpochMilli(paidAt).atZone(ZoneId.systemDefault()).toOffsetDateTime().withNano(0);
        String time = localTime.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
        DecimalFormat format = new DecimalFormat(precision == 0 ? "#,##0" : "#,##0.00", DecimalFormatSymbols.getInstance(Locale.US));
        String number = format.format(value);
        String display = code.equals("KRW") ? number + "원" : code + " " + number;
        String body = "결제금액: " + display + "\n가맹점: " + store + "\n승인번호: " + reference + "\n거래일시: " + time;
        // A merchant can itself look like another amount, approval number or cancellation.
        Map<String, String> parsed = CardParser.parse("시연카드", TITLE, body, paidAt);
        if (parsed == null || !"approval".equals(parsed.get("event_type")) || !store.equals(parsed.get("merchant"))
                || !code.equals(parsed.get("currency")) || !value.toPlainString().equals(parsed.get("amount"))
                || !String.valueOf(reference).equals(parsed.get("approval_ref")) || !time.equals(parsed.get("occurred_at"))) {
            invalid(merchant, "수집기가 사용처를 구분하기 어려워요. 금액이나 승인 문구 없이 가게 이름을 입력해 주세요.");
            return;
        }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            pendingPermissionTime = paidAt;
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION);
            return;
        }
        NotificationManager notifications = getSystemService(NotificationManager.class);
        if (!notifications.areNotificationsEnabled()
                || notifications.getNotificationChannel(CHANNEL).getImportance() == NotificationManager.IMPORTANCE_NONE) {
            status.setText("휴대폰 설정에서 여행 결제 시연기의 ‘테스트 결제’ 알림을 켜 주세요.");
            return;
        }
        if (!prefs.edit().putLong("last_reference", reference).putString("currency", code)
                .putString("amount", rawAmount).putString("merchant", store).commit()) {
            status.setText("테스트 결제를 저장하지 못했어요. 다시 눌러 주세요.");
            return;
        }
        String summary = store + " · " + display;
        Notification notice = new Notification.Builder(this, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(TITLE).setContentText(summary)
                .setWhen(paidAt).setShowWhen(true)
                .setStyle(new Notification.BigTextStyle().bigText(body)).setAutoCancel(true).build();
        notifications.notify(String.valueOf(reference), 1, notice);
        status.setText(summary + " 알림을 보냈어요.\n결제 시각 " + localTime.format(DateTimeFormatter.ofPattern("HH:mm:ss"))
                + " · 승인번호 " + reference);
    }

    private void invalid(EditText field, String message) {
        field.requestFocus();
        field.setError(message);
    }

    @Override protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        state.putLong("permission_time", pendingPermissionTime);
    }

    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (request != NOTIFICATION_PERMISSION) return;
        long paidAt = pendingPermissionTime;
        pendingPermissionTime = 0;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
            if (paidAt != 0) sendPayment(paidAt);
        } else {
            status.setText("휴대폰 설정에서 여행 결제 시연기의 알림을 허용한 뒤 다시 눌러 주세요.");
        }
    }
}
