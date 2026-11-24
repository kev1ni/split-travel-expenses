package kr.trip.collector;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.text.InputType;
import android.view.View;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import java.util.Map;
import java.util.TreeMap;

public final class CollectorSettingsActivity extends Activity {
    private static final int TEXT = InputType.TYPE_CLASS_TEXT;
    private SharedPreferences prefs;
    private LinearLayout page;
    private Switch enabled;
    private EditText issuer, cardPackage;
    private TextView linkedTrip, accessStatus, delivery, latest;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        prefs = Sources.prefs(this);
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(Color.WHITE);
        setContentView(scroll);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            getWindow().getInsetsController().setSystemBarsAppearance(
                    android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                            | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
                    android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                            | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
            scroll.setOnApplyWindowInsetsListener((v, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars()
                        | WindowInsets.Type.ime() | WindowInsets.Type.displayCutout());
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return insets;
            });
        }
        page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setPadding(dp(20), dp(16), dp(20), dp(32));
        page.setFocusableInTouchMode(true);
        scroll.addView(page);

        button("여행 화면으로 돌아가기", v -> finish());
        heading("카드 수집 설정", 27);
        heading("카드 지출을 등록할 여행", 20);
        linkedTrip = note("");
        button("수집할 여행 선택·변경", v -> { setResult(RESULT_OK); finish(); });
        heading("수집할 카드사", 20);
        issuer = field("카드사 이름", "예: 현대카드", TEXT, "issuer");
        cardPackage = field("카드 앱 패키지", "앱 목록에서 선택하거나 직접 입력", TEXT, "card_package");
        button("설치된 카드 앱 선택", v -> chooseApp());
        button("카드 앱 설정 저장", v -> { if (save(enabled.isChecked())) toast("카드 앱을 저장했어요"); });
        enabled = new Switch(this);
        enabled.setText("카드 알림 수집");
        enabled.setMinHeight(dp(56));
        if (!Sources.isEligibleCardPackage(this, prefs.getString("card_package", ""))) {
            prefs.edit().putBoolean("enabled", false).apply();
        }
        enabled.setChecked(prefs.getBoolean("enabled", false));
        page.addView(enabled);
        enabled.setOnCheckedChangeListener((toggle, checked) -> {
            if (checked && !save(true)) { toggle.setChecked(false); return; }
            if (!checked) prefs.edit().putBoolean("enabled", false).apply();
            refresh();
        });
        heading("수신 권한", 20);
        accessStatus = note("");
        button("카드 앱 알림 접근 설정", v -> {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            try { startActivity(intent); }
            catch (android.content.ActivityNotFoundException e) { toast("기기 설정에서 알림 접근을 여세요"); }
        });

        heading("최근 수집 결과", 20);
        delivery = note("");
        latest = note("");
        latest.setTypeface(Typeface.MONOSPACE);
        latest.setTextIsSelectable(true);
        button("결과 새로고침", v -> refresh());
        button("대기 중인 전송 다시 시도", v -> {
            if (TripConnection.current(prefs) == null) { toast("로그인한 뒤 수집할 여행을 선택하세요"); return; }
            if (!prefs.getBoolean("enabled", false)) { toast("먼저 카드 알림 수집을 켜세요"); return; }
            CollectorStore.retry(this);
            refresh();
            toast("재시도를 요청했습니다. 잠시 후 결과를 새로고침하세요");
        });
        button("최근 JSON 공유", v -> {
            String json = CollectorStore.latest(this);
            if (json == null || json.isEmpty()) { toast("공유할 수집 결과가 없습니다"); return; }
            startActivity(Intent.createChooser(new Intent(Intent.ACTION_SEND)
                    .setType("text/plain").putExtra(Intent.EXTRA_TEXT, json), "결제 이벤트 JSON 공유"));
        });
        refresh();
    }

    private void chooseApp() {
        Intent main = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        PackageManager pm = getPackageManager();
        Map<String, String> choices = new TreeMap<>();
        for (ResolveInfo item : pm.queryIntentActivities(main, 0)) {
            String pkg = item.activityInfo.packageName;
            if (Sources.isEligibleCardPackage(this, pkg)) choices.put(item.loadLabel(pm) + "\n" + pkg, pkg);
        }
        if (choices.isEmpty()) { toast("목록에 앱이 없습니다. 패키지 이름을 직접 입력하세요"); return; }
        String[] labels = choices.keySet().toArray(new String[0]);
        new AlertDialog.Builder(this).setTitle("결제 알림을 보낼 카드 앱 선택")
                .setItems(labels, (dialog, index) -> {
                    String label = labels[index];
                    String pkg = choices.get(label);
                    if (!pkg.equals(prefs.getString("card_package", "")) || value(issuer).isEmpty()) {
                        String name = "kr.trip.demo.notifier".equals(pkg) ? "시연카드" : label.substring(0, label.lastIndexOf('\n'));
                        issuer.setText(name);
                    }
                    cardPackage.setText(pkg);
                    if (save(true)) {
                        enabled.setChecked(true);
                        toast("이 앱의 카드 승인 푸시를 수집해요");
                    }
                })
                .setNegativeButton("닫기", null).show();
    }

    private boolean save(boolean active) {
        String bank = value(issuer);
        String pkg = value(cardPackage);
        if (!pkg.isEmpty() && (!pkg.matches("[a-zA-Z][a-zA-Z0-9_]*(\\.[a-zA-Z][a-zA-Z0-9_]*)+")
                || !Sources.isEligibleCardPackage(this, pkg))) return invalid(cardPackage, "카드 앱의 패키지 이름을 확인하세요");
        if (active && bank.isEmpty()) return invalid(issuer, "카드사 이름을 입력하세요");
        if (active && pkg.isEmpty()) return invalid(cardPackage, "수집할 카드 앱을 선택하세요");
        prefs.edit().putString("issuer", bank).putString("card_package", pkg)
                .putBoolean("enabled", active)
                .remove("message_package").remove("message_sender_name").remove("sms_senders").remove("message_since")
                .apply();
        refresh();
        return true;
    }

    @Override protected void onResume() {
        super.onResume();
        refresh();
    }

    private void refresh() {
        if (delivery == null) return;
        TripConnection connection = TripConnection.current(prefs);
        linkedTrip.setText(connection == null ? "앱에서 로그인하고 수집할 여행을 선택하세요." : connection.title);
        boolean push = Sources.hasNotificationAccess(this);
        accessStatus.setText("카드 앱 알림 접근 " + (push ? "허용됨" : "꺼짐"));
        delivery.setText(CollectorStore.status(this));
        String json = CollectorStore.latest(this);
        latest.setText(json == null || json.isEmpty() ? "수집한 결제 알림이 아직 없습니다." : json);
    }

    private TextView note(String text) {
        TextView view = new TextView(this);
        view.setTextSize(16);
        view.setTextColor(Color.rgb(39, 54, 62));
        view.setText(text);
        view.setPadding(0, dp(4), 0, dp(8));
        page.addView(view);
        return view;
    }

    private void heading(String text, int size) {
        TextView view = note(text);
        view.setTextSize(size);
        view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        view.setPadding(0, dp(16), 0, dp(6));
    }

    private EditText field(String label, String hint, int type, String key) {
        TextView caption = note(label);
        EditText edit = new EditText(this);
        edit.setId(View.generateViewId());
        caption.setLabelFor(edit.getId());
        edit.setSingleLine(true);
        edit.setInputType(type);
        edit.setTextSize(16);
        edit.setHint(hint);
        edit.setSaveEnabled(false);
        if (key != null) edit.setText(prefs.getString(key, ""));
        page.addView(edit);
        return edit;
    }

    private void button(String label, View.OnClickListener action) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setOnClickListener(action);
        page.addView(button);
    }

    private boolean invalid(EditText field, String message) {
        field.setError(message);
        field.requestFocus();
        return false;
    }

    private static String value(EditText field) { return field.getText().toString().trim(); }
    private int dp(int value) { return Math.round(getResources().getDisplayMetrics().density * value); }
    private void toast(String text) { Toast.makeText(this, text, Toast.LENGTH_SHORT).show(); }
}
