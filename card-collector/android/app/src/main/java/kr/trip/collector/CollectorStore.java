package kr.trip.collector;

import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.io.OutputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.net.ssl.HttpsURLConnection;

final class CollectorStore extends SQLiteOpenHelper {
    private static final ExecutorService NETWORK = Executors.newSingleThreadExecutor();
    private static CollectorStore instance;

    private CollectorStore(Context context) {
        super(context.getApplicationContext(), "card-outbox.db", null, 2);
    }

    private static synchronized CollectorStore db(Context context) {
        if (instance == null) instance = new CollectorStore(context);
        return instance;
    }

    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE events (event_id TEXT PRIMARY KEY, payload TEXT NOT NULL,"
                + " binding TEXT NOT NULL, notification_hash TEXT UNIQUE, state TEXT NOT NULL,"
                + " last_http INTEGER)");
    }

    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        if (oldVersion < 2) {
            List<String> localOnly = new ArrayList<>();
            try (Cursor rows = db.rawQuery("SELECT event_id, payload FROM events WHERE state='pending'", null)) {
                while (rows.moveToNext()) {
                    try {
                        if ("app_push".equals(new JSONObject(rows.getString(1)).optString("source"))) continue;
                    } catch (JSONException ignored) {
                        // Keep unreadable legacy records on this device.
                    }
                    localOnly.add(rows.getString(0));
                }
            }
            ContentValues change = new ContentValues();
            change.put("state", "local");
            for (String id : localOnly) db.update("events", change, "event_id=?", new String[]{id});
        }
    }

    private static JSONObject payload(String issuer,
                                      Map<String, String> fields, long receivedMs) {
        try {
            JSONObject json = new JSONObject();
            json.put("event_id", UUID.randomUUID().toString());
            json.put("source", "app_push");
            json.put("message_format", JSONObject.NULL);
            json.put("issuer", issuer);
            for (String key : new String[]{"event_type", "amount", "currency", "merchant", "approval_ref", "occurred_at"}) {
                String value = fields.get(key);
                json.put(key, value == null ? JSONObject.NULL : value);
            }
            json.put("received_at", Instant.ofEpochMilli(receivedMs).toString());
            return json;
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    static void capture(Context context, String issuer, String title, String body, long receivedMs, String notificationKey) {
        SharedPreferences prefs = Sources.prefs(context);
        if (!prefs.getBoolean("enabled", false) || issuer == null || issuer.trim().isEmpty()) return;
        Map<String, String> fields = CardParser.parse(issuer, title, body, receivedMs);
        if (fields == null) return;

        JSONObject event = payload(issuer, fields, receivedMs);
        Destination destination = new Destination(prefs);
        ContentValues row = new ContentValues();
        row.put("event_id", event.optString("event_id"));
        row.put("payload", event.toString());
        row.put("binding", destination.binding);
        row.put("state", destination.binding.isEmpty() ? "local" : "pending");
        if (notificationKey != null) {
            // Android notification IDs can be reused for a later purchase.
            row.put("notification_hash", hash(notificationKey + "\n" + receivedMs + "\n" + title + "\n" + body));
        }
        long id = db(context).getWritableDatabase().insertWithOnConflict(
                "events", null, row, SQLiteDatabase.CONFLICT_IGNORE);
        if (id != -1 && !destination.binding.isEmpty()) retry(context);
    }

    static String latest(Context context) {
        try (Cursor c = db(context).getReadableDatabase().rawQuery(
                "SELECT payload FROM events ORDER BY rowid DESC LIMIT 1", null)) {
            return c.moveToFirst() ? c.getString(0) : null;
        }
    }

    static String status(Context context) {
        int local = 0, pending = 0, sent = 0;
        SQLiteDatabase db = db(context).getReadableDatabase();
        try (Cursor c = db.rawQuery("SELECT state, count(*) FROM events GROUP BY state", null)) {
            while (c.moveToNext()) {
                switch (c.getString(0)) {
                    case "local": local = c.getInt(1); break;
                    case "pending": pending = c.getInt(1); break;
                    case "sent": sent = c.getInt(1); break;
                }
            }
        }
        String summary = "기기 전용 " + local + "건 · 전송 대기 " + pending + "건 · 전송 완료 " + sent + "건";
        try (Cursor c = db.rawQuery("SELECT last_http FROM events WHERE state='pending' AND"
                + " last_http IS NOT NULL ORDER BY rowid DESC LIMIT 1", null)) {
            if (c.moveToFirst()) {
                int code = c.getInt(0);
                summary += code == 0 ? "\n연결 실패 · 연결 후 다시 전송하세요." : "\n서버 응답 HTTP " + code;
            }
        }
        return summary;
    }

    static void retry(Context context) {
        Context app = context.getApplicationContext();
        NETWORK.execute(() -> flush(app));
    }

    private static void flush(Context app) {
        SharedPreferences prefs = Sources.prefs(app);
        Destination destination = new Destination(prefs);
        if (destination.binding.isEmpty() || !prefs.getBoolean("enabled", false)) return;
        SQLiteDatabase db = db(app).getWritableDatabase();
        try (Cursor c = db.rawQuery("SELECT event_id, payload FROM events WHERE state='pending'"
                + " AND binding=? ORDER BY rowid", new String[]{destination.binding})) {
            while (c.moveToNext()) {
                if (!prefs.getBoolean("enabled", false) || !destination.matches(prefs)) return;
                int code;
                try {
                    code = destination.post(c.getString(1));
                } catch (IOException e) {
                    code = 0;
                }
                ContentValues update = new ContentValues();
                update.put("last_http", code);
                if (code >= 200 && code < 300) update.put("state", "sent");
                db.update("events", update, "event_id=?", new String[]{c.getString(0)});
                if (code == 0 || code == 401 || code == 403 || code == 429 || code >= 500) return;
            }
        }
    }

    private static String hash(String value) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder out = new StringBuilder(bytes.length * 2);
            for (byte b : bytes) {
                out.append(Character.forDigit((b >>> 4) & 15, 16));
                out.append(Character.forDigit(b & 15, 16));
            }
            return out.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new AssertionError(e);
        }
    }

    private static final class Destination {
        final String endpoint;
        final String token;
        final String binding;

        Destination(SharedPreferences prefs) {
            Map<String, ?> settings = prefs.getAll();
            endpoint = (String) settings.getOrDefault("endpoint", null);
            token = (String) settings.getOrDefault("token", null);
            binding = valid(endpoint, token) ? hash(endpoint + "\n" + token) : "";
        }

        boolean matches(SharedPreferences prefs) {
            Map<String, ?> current = prefs.getAll();
            return endpoint.equals(current.get("endpoint")) && token.equals(current.get("token"));
        }

        private static boolean valid(String endpoint, String token) {
            if (endpoint == null || token == null || !token.matches("[!-~]+")) return false;
            try {
                URI uri = URI.create(endpoint);
                return "https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null
                        && uri.getUserInfo() == null && uri.getFragment() == null;
            } catch (IllegalArgumentException e) {
                return false;
            }
        }

        int post(String payload) throws IOException {
            HttpsURLConnection c = (HttpsURLConnection) URI.create(endpoint).toURL().openConnection();
            try {
                c.setInstanceFollowRedirects(false);
                c.setConnectTimeout(8000);
                c.setReadTimeout(8000);
                c.setRequestMethod("POST");
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                c.setRequestProperty("Authorization", "Bearer " + token);
                byte[] bytes = payload.getBytes(StandardCharsets.UTF_8);
                c.setFixedLengthStreamingMode(bytes.length);
                try (OutputStream out = c.getOutputStream()) {
                    out.write(bytes);
                }
                return c.getResponseCode();
            } finally {
                c.disconnect();
            }
        }
    }
}
