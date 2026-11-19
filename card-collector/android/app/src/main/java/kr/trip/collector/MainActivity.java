package kr.trip.collector;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.provider.Telephony;
import android.text.InputType;
import android.text.TextUtils;
import android.view.View;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.ArrayAdapter;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONException;
import org.json.JSONObject;

import java.net.URI;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

public final class MainActivity extends Activity {
    private static final int TEXT = InputType.TYPE_CLASS_TEXT;
    private static final int MULTILINE = TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE;
    private static final String[] MESSAGE_PACKAGES = {"", Sources.SAMSUNG_MESSAGES, Sources.GOOGLE_MESSAGES};
    private static final String SAMPLE = "[Web발신]\n현대 넥슨 승인\n김*별\n1,400원 일시불\n03/12 08:25\n예시마트샘플점\n누적23,700원";
    private SharedPreferences prefs;
    private LinearLayout page;
    private Switch enabled;
    private Spinner messageMode;
    private EditText messageName;
    private EditText issuer, phones, cardPackage, endpoint, token, rcsSender, rcsBody;
    private TextView accessStatus, delivery, latest;
    private AlertDialog rcsDialog;

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

        heading("여행 카드 수집기", 27);
        note("등록한 카드사의 결제 알림에서 금액과 통화를 읽습니다. 수집할 카드사 한 곳을 설정하세요.");
        heading("수집할 카드사", 20);
        issuer = field("카드사 이름", "예: 현대카드", TEXT, "issuer");
        TextView modeLabel = note("문자·채팅+ 수신 경로");
        messageMode = new Spinner(this);
        messageMode.setId(View.generateViewId());
        modeLabel.setLabelFor(messageMode.getId());
        ArrayAdapter<String> modes = new ArrayAdapter<>(this, android.R.layout.simple_spinner_item,
                new String[]{"SMS 수신기 (일반 문자만)", "삼성 메시지 알림 (채팅+·문자)", "Google 메시지 알림 (채팅+·문자)"});
        modes.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        messageMode.setAdapter(modes);
        String previous = prefs.getString("message_package", "");
        if (!prefs.contains("enabled")) previous = Telephony.Sms.getDefaultSmsPackage(this);
        for (int i = 0; i < MESSAGE_PACKAGES.length; i++) {
            if (MESSAGE_PACKAGES[i].equals(previous)) messageMode.setSelection(i);
        }
        page.addView(messageMode);
        phones = field("SMS · 채팅+ 발신번호", "여러 번호는 쉼표로 구분", TEXT, "sms_senders");
        messageName = field("현대카드 알림에 표시되는 발신자 이름 (선택)", "예: 현대카드", TEXT, "message_sender_name");
        note("채팅+를 받는 메시지 앱을 고르고 알림 접근을 허용하세요. 현대 넥슨 승인 알림에 번호 없이 이름만 보이면 실제 발신자 표시명도 그대로 등록하세요.");
        cardPackage = field("카드 앱 패키지", "앱 목록에서 선택하거나 직접 입력", TEXT, "card_package");
        button("설치된 카드 앱 선택", v -> chooseApp());
        heading("서버 연결", 20);
        endpoint = field("수집 API 주소", "비워 두면 이 기기에만 저장", TEXT | InputType.TYPE_TEXT_VARIATION_URI, "endpoint");
        token = field("Bearer 토큰", "API 주소를 쓰면 서버 팀에서 받은 토큰 입력", TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD, "token");
        button("설정 저장", v -> { if (save(enabled.isChecked())) toast("설정을 저장했습니다"); });
        enabled = new Switch(this);
        enabled.setText("카드 알림 수집");
        enabled.setMinHeight(dp(56));
        enabled.setChecked(prefs.getBoolean("enabled", false));
        page.addView(enabled);
        enabled.setOnCheckedChangeListener((toggle, checked) -> {
            if (checked && !save(true)) { toggle.setChecked(false); return; }
            if (!checked) prefs.edit().putBoolean("enabled", false).apply();
            refresh();
        });
        heading("수신 권한", 20);
        accessStatus = note("");
        button("SMS 수신 권한 허용", v -> {
            if (checkSelfPermission(Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED) {
                toast("SMS 수신 권한이 이미 켜져 있습니다");
            } else {
                requestPermissions(new String[]{Manifest.permission.RECEIVE_SMS}, 1);
            }
        });
        button("메시지·카드 앱 알림 접근 설정", v -> {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            try { startActivity(intent); }
            catch (android.content.ActivityNotFoundException e) { toast("기기 설정에서 알림 접근을 여세요"); }
        });

        heading("지난 채팅+ 한 건 가져오기 (선택)", 20);
        note("수집을 켜기 전에 받은 건이나 알림에 본문이 숨겨졌던 건을 직접 추가할 수 있습니다.");
        rcsSender = field("확인한 발신번호", "등록한 번호와 일치해야 합니다", InputType.TYPE_CLASS_PHONE, null);
        rcsBody = field("채팅+ 결제 알림 한 건", "메시지 본문 붙여넣기", MULTILINE, null);
        rcsBody.setMinLines(2);
        button("채팅+ 미리보기", v -> previewRcs());
        heading("최근 수집 결과", 20);
        delivery = note("");
        latest = note("");
        latest.setTypeface(Typeface.MONOSPACE);
        latest.setTextIsSelectable(true);
        button("결과 새로고침", v -> refresh());
        button("대기 중인 전송 다시 시도", v -> {
            if (prefs.getString("endpoint", "").isEmpty()) { toast("먼저 수집 API 주소를 저장하세요"); return; }
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
        button("현대카드 채팅+ 예시 미리보기", v ->
                new AlertDialog.Builder(this).setTitle("현대카드 채팅+ 예시 · 미리보기")
                        .setMessage("시연용 문구입니다. 실시간 수신·저장·전송 없이 파싱합니다.\n\n"
                                + SAMPLE + "\n\n" + CollectorStore.previewRcs("현대카드", SAMPLE))
                        .setPositiveButton("닫기", null).show());
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
                .setItems(labels, (dialog, index) -> cardPackage.setText(choices.get(labels[index])))
                .setNegativeButton("닫기", null).show();
    }

    private boolean save(boolean active) {
        String bank = value(issuer);
        String messages = MESSAGE_PACKAGES[messageMode.getSelectedItemPosition()];
        String name = value(messageName);
        String pkg = value(cardPackage);
        String url = value(endpoint);
        String bearer = value(token);
        Set<String> senders;
        try { senders = Sources.phoneList(value(phones)); }
        catch (IllegalArgumentException e) { return invalid(phones, "발신번호를 쉼표로 구분해 입력하세요"); }
        if (!pkg.isEmpty() && (!pkg.matches("[a-zA-Z][a-zA-Z0-9_]*(\\.[a-zA-Z][a-zA-Z0-9_]*)+")
                || !Sources.isEligibleCardPackage(this, pkg))) return invalid(cardPackage, "카드 앱의 패키지 이름을 확인하세요");
        if (active && bank.isEmpty()) return invalid(issuer, "카드사 이름을 입력하세요");
        if (!messages.isEmpty() && !name.isEmpty() && !bank.matches("현대(?:\\s*(?:카드|넥슨))?"))
            return invalid(messageName, "표시명 등록은 현대 넥슨 승인 양식에서 지원합니다. 다른 카드사는 번호를 입력하세요");
        if (active && senders.isEmpty() && pkg.isEmpty() && (messages.isEmpty() || name.isEmpty()))
            return invalid(phones, "발신번호, 현대카드 표시명 또는 카드 앱을 등록하세요");
        if (!url.isEmpty()) {
            try {
                URI uri = URI.create(url);
                if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null
                        || uri.getUserInfo() != null || uri.getFragment() != null) throw new IllegalArgumentException();
            } catch (IllegalArgumentException e) { return invalid(endpoint, "https://로 시작하는 전체 API 주소를 입력하세요"); }
        }
        if (bearer.matches("(?s).*[^\\x21-\\x7e].*")) return invalid(token, "공백과 줄바꿈이 없는 Bearer 토큰을 입력하세요");
        if (!url.isEmpty() && bearer.isEmpty()) return invalid(token, "이 수집 API에 사용할 Bearer 토큰을 입력하세요");
        if (url.isEmpty() && !bearer.isEmpty()) return invalid(endpoint, "이 토큰에 연결할 수집 API 주소를 입력하세요");
        String numbers = TextUtils.join(",", senders);
        SharedPreferences.Editor editor = prefs.edit();
        if (active && (!prefs.getBoolean("enabled", false)
                || !messages.equals(prefs.getString("message_package", "")) || !name.equals(prefs.getString("message_sender_name", ""))
                || !numbers.equals(prefs.getString("sms_senders", "")) || !bank.equals(prefs.getString("issuer", "")))) {
            editor.putLong("message_since", System.currentTimeMillis());
        }
        editor.putString("issuer", bank).putString("card_package", pkg)
                .putString("message_package", messages).putString("message_sender_name", name)
                .putString("sms_senders", numbers).putString("endpoint", url)
                .putString("token", bearer).putBoolean("enabled", active).apply();
        refresh();
        return true;
    }

    private void previewRcs() {
        if (rcsDialog != null && rcsDialog.isShowing()) return;
        if (!prefs.getBoolean("enabled", false)) { toast("카드 알림 수집을 먼저 켜세요"); return; }
        String bank = prefs.getString("issuer", "");
        Set<String> registered = Sources.phoneList(prefs.getString("sms_senders", ""));
        String sender = Sources.phone(value(rcsSender));
        if (!registered.contains(sender)) { invalid(rcsSender, "등록한 발신번호 중 하나를 확인해 입력하세요"); return; }
        String original = value(rcsBody);
        String json = CollectorStore.previewRcs(bank, original);
        if (json == null || json.isEmpty()) { invalid(rcsBody, "승인 또는 취소 여부, 통화와 거래 금액을 확인하세요"); return; }
        boolean online = !prefs.getString("endpoint", "").isEmpty();
        String details;
        try {
            JSONObject event = new JSONObject(json);
            String kind = "cancel".equals(event.getString("event_type")) ? "취소" : "승인";
            details = kind + "   " + event.getString("amount") + " " + event.getString("currency");
            if (!event.isNull("merchant")) details += "\n가맹점   " + event.getString("merchant");
            if (!event.isNull("occurred_at")) details += "\n거래 시각   " + event.getString("occurred_at");
        } catch (JSONException e) { invalid(rcsBody, "결제 정보를 확인할 수 없습니다"); return; }
        rcsDialog = new AlertDialog.Builder(this).setTitle("채팅+ 한 건 확인")
                .setMessage(bank + " · " + sender + "\n\n" + details)
                .setNegativeButton("돌아가기", null)
                .setPositiveButton(online ? "저장 및 전송" : "기기에 저장", (d, w) -> {
                    CollectorStore.capture(this, "message", "rcs", bank, "", original, System.currentTimeMillis(), null);
                    rcsBody.setText("");
                    refresh();
                    toast("채팅+ 수집을 요청했습니다");
                }).setOnDismissListener(d -> rcsDialog = null).show();
    }

    @Override protected void onResume() {
        super.onResume();
        refresh();
    }

    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        refresh();
    }

    private void refresh() {
        if (delivery == null) return;
        boolean sms = checkSelfPermission(Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED;
        ComponentName service = new ComponentName(this, CardNotificationListener.class);
        boolean push;
        if (Build.VERSION.SDK_INT >= 27) {
            push = getSystemService(NotificationManager.class).isNotificationListenerAccessGranted(service);
        } else {
            String listeners = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
            push = false;
            if (listeners != null) for (String name : listeners.split(":")) {
                if (service.equals(ComponentName.unflattenFromString(name))) { push = true; break; }
            }
        }
        boolean notificationMode = !prefs.getString("message_package", "").isEmpty();
        accessStatus.setText((notificationMode ? "채팅+·문자 알림" : "SMS 수신 " + (sms ? "허용됨" : "꺼짐"))
                + "   ·   알림 접근 " + (push ? "허용됨" : "꺼짐"));
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
        edit.setSingleLine(type != MULTILINE);
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
