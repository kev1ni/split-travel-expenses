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
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;

public final class MainActivity extends Activity {
    private static final String CHANNEL = "demo_payments";
    private static final int NOTIFICATION_PERMISSION = 1;
    private TextView status;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getSystemService(NotificationManager.class).createNotificationChannel(
                new NotificationChannel(CHANNEL, "테스트 결제", NotificationManager.IMPORTANCE_HIGH));

        ScrollView scroll = new ScrollView(this);
        LinearLayout form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        int inset = Math.round(24 * getResources().getDisplayMetrics().density);
        form.setPadding(inset, inset, inset, inset);
        scroll.addView(form);

        TextView sample = new TextView(this);
        sample.setTextSize(24);
        sample.setText("예시마트 · 1,400원");
        form.addView(sample);
        TextView instructions = new TextView(this);
        instructions.setPadding(0, inset / 2, 0, inset);
        instructions.setText("버튼을 누르면 이 휴대폰에 가상 결제 승인 알림이 뜹니다. "
                + "여행 카드 수집기의 카드 앱으로 ‘여행 결제 시연기’를 선택해 주세요.");
        form.addView(instructions);
        Button send = new Button(this);
        send.setText("테스트 결제 알림 보내기");
        send.setOnClickListener(v -> requestOrPost());
        form.addView(send);
        status = new TextView(this);
        status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        status.setPadding(0, inset / 2, 0, 0);
        form.addView(status);
        setContentView(scroll);
    }

    private void requestOrPost() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION);
            return;
        }
        postPayment();
    }

    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (request != NOTIFICATION_PERMISSION) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
            postPayment();
        } else {
            status.setText("휴대폰 설정에서 여행 결제 시연기의 알림을 허용한 뒤 다시 눌러 주세요.");
        }
    }

    private void postPayment() {
        NotificationManager notifications = getSystemService(NotificationManager.class);
        if (!notifications.areNotificationsEnabled()
                || notifications.getNotificationChannel(CHANNEL).getImportance() == NotificationManager.IMPORTANCE_NONE) {
            status.setText("휴대폰 설정에서 여행 결제 시연기의 ‘테스트 결제’ 알림을 켜 주세요.");
            return;
        }

        SharedPreferences prefs = getSharedPreferences("demo", MODE_PRIVATE);
        long last = prefs.getLong("last_reference", 0);
        // Reserve the number before posting so retries and restarts produce different sample payments.
        long reference = last == 0 ? 100_000_000L + new SecureRandom().nextInt(900_000_000) : last + 1;
        if (!prefs.edit().putLong("last_reference", reference).commit()) {
            status.setText("새 승인번호를 저장하지 못했어요. 다시 눌러 주세요.");
            return;
        }
        String occurredAt = OffsetDateTime.now().withNano(0).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
        String body = "결제금액: 1,400원\n가맹점: 예시마트\n승인번호: " + reference + "\n거래일시: " + occurredAt;
        Notification notice = new Notification.Builder(this, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle("여행 결제 시연기 · 테스트 결제 승인")
                .setContentText("예시마트 · 1,400원")
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .build();
        notifications.notify(String.valueOf(reference), 1, notice);
        status.setText("예시마트 1,400원 알림을 보냈어요. 승인번호 " + reference);
    }
}
