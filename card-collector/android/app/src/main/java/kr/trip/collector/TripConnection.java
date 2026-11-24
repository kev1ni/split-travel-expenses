package kr.trip.collector;

import android.content.SharedPreferences;
import android.net.Uri;
import android.webkit.CookieManager;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import javax.net.ssl.HttpsURLConnection;

/** A collector may submit only while its paired WebView login is still current. */
final class TripConnection {
    static final String ORIGIN = "https://split-travel-expenses.vercel.app";
    static final String EVENTS_URL = ORIGIN + "/api/collector/events";
    private static final Uri SITE = Uri.parse(ORIGIN);

    static boolean isSite(Uri uri) {
        return uri != null && "https".equalsIgnoreCase(uri.getScheme())
                && (SITE.getEncodedAuthority().equalsIgnoreCase(uri.getEncodedAuthority())
                    || (SITE.getPort() == -1 && (SITE.getEncodedAuthority() + ":443").equalsIgnoreCase(uri.getEncodedAuthority())));
    }

    static String sessionCookie() {
        String cookies = CookieManager.getInstance().getCookie(EVENTS_URL);
        if (cookies != null) for (String part : cookies.split(";")) {
            String cookie = part.trim();
            if (cookie.startsWith("session=") && cookie.length() > "session=".length()) return cookie;
        }
        return "";
    }

    private static String sessionFingerprint(String cookie) {
        return cookie.isEmpty() ? "" : CollectorStore.hash(cookie);
    }

    final String title;
    final String scope;
    final String token;
    private final String fingerprint;

    private TripConnection(String title, String scope, String token, String fingerprint) {
        this.title = title;
        this.scope = scope;
        this.token = token;
        this.fingerprint = fingerprint;
    }

    static TripConnection current(SharedPreferences prefs) {
        Map<String, ?> values = prefs.getAll();
        String fingerprint = (String) values.get("collector_session");
        String token = (String) values.get("token");
        if (fingerprint == null || token == null || !fingerprint.equals(sessionFingerprint(sessionCookie()))) return null;
        return new TripConnection((String) values.get("trip_title"), (String) values.get("collector_scope"), token, fingerprint);
    }

    boolean stillCurrent(SharedPreferences prefs) {
        return token.equals(prefs.getString("token", "")) && fingerprint.equals(sessionFingerprint(sessionCookie()));
    }

    static final class PairingIssue extends IOException {
        PairingIssue(String message) { super(message); }
    }

    static TripConnection request(long tripId, String cookie) throws IOException, JSONException {
        if (cookie.isEmpty()) throw new PairingIssue("먼저 앱에서 로그인해 주세요.");
        URL url = new URL(ORIGIN + "/api/v1/trips/" + tripId + "/collector-connection");
        HttpsURLConnection c = (HttpsURLConnection) url.openConnection();
        try {
            c.setConnectTimeout(15000);
            c.setReadTimeout(35000);
            c.setInstanceFollowRedirects(false);
            c.setUseCaches(false);
            c.setRequestMethod("POST");
            c.setRequestProperty("Origin", ORIGIN);
            c.setRequestProperty("Cookie", cookie);
            c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            c.setDoOutput(true);
            try (OutputStream out = c.getOutputStream()) {
                out.write("{}".getBytes(StandardCharsets.UTF_8));
            }
            int status = c.getResponseCode();
            if (status == 401) throw new PairingIssue("로그인한 뒤 여행을 다시 선택해 주세요.");
            if (status == 403 || status == 404) throw new PairingIssue("내가 참여 중인 여행을 선택해 주세요.");
            if (status != 200 && status != 201) throw new PairingIssue("서버에 연결하지 못했어요. 잠시 후 다시 선택해 주세요.");
            StringBuilder body = new StringBuilder();
            try (BufferedReader in = new BufferedReader(new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8))) {
                char[] buffer = new char[1024];
                int n;
                while ((n = in.read(buffer)) != -1) {
                    if (body.length() + n > 16384) throw new IOException("서버 응답 크기를 확인해 주세요.");
                    body.append(buffer, 0, n);
                }
            }
            JSONObject data = new JSONObject(body.toString()).getJSONObject("data");
            long user = data.getLong("user_id"), payer = data.getLong("payer_member_id");
            String token = data.getString("token"), title = data.getString("trip_title").trim();
            if (data.getLong("trip_id") != tripId || user <= 0 || payer <= 0 || title.isEmpty()
                    || !token.matches("[!-~]{1,2048}")) throw new JSONException("Invalid collector connection");
            String scope = CollectorStore.hash(ORIGIN + "|" + user + "|" + tripId + "|" + payer);
            // Persist the WebView login before reporting a successful pairing, even if Android
            // stops the process immediately afterwards. This request runs on the pairing worker.
            CookieManager.getInstance().flush();
            return new TripConnection(title, scope, token, sessionFingerprint(cookie));
        } finally {
            c.disconnect();
        }
    }

    boolean activate(SharedPreferences prefs) {
        if (!fingerprint.equals(sessionFingerprint(sessionCookie()))) return false;
        synchronized (TripConnection.class) {
            prefs.edit().remove("endpoint").putString("token", token).putString("trip_title", title)
                    .putString("collector_scope", scope).putString("collector_session", fingerprint).apply();
        }
        return true;
    }

    static synchronized void invalidate(SharedPreferences prefs, String token) {
        if (token.equals(prefs.getString("token", ""))) prefs.edit().remove("token").apply();
    }
}
