package kr.trip.collector;

import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.provider.Telephony;
import android.os.Build;
import android.provider.Settings;

final class Sources {
    static final String SAMSUNG_MESSAGES = "com.samsung.android.messaging";
    static final String GOOGLE_MESSAGES = "com.google.android.apps.messaging";

    private Sources() {}

    static SharedPreferences prefs(Context context) {
        SharedPreferences prefs = context.getSharedPreferences("collector", Context.MODE_PRIVATE);
        synchronized (TripConnection.class) {
            if (prefs.contains("endpoint") && !prefs.contains("collector_session")) {
                // A manually entered token from an older APK cannot identify this WebView's user.
                prefs.edit().remove("endpoint").remove("token").apply();
            }
        }
        return prefs;
    }

    static boolean hasNotificationAccess(Context context) {
        ComponentName service = new ComponentName(context, CardNotificationListener.class);
        if (Build.VERSION.SDK_INT >= 27) {
            return context.getSystemService(NotificationManager.class).isNotificationListenerAccessGranted(service);
        }
        String list = Settings.Secure.getString(context.getContentResolver(), "enabled_notification_listeners");
        if (list != null) for (String entry : list.split(":")) {
            if (service.equals(ComponentName.unflattenFromString(entry))) return true;
        }
        return false;
    }

    static boolean isEligibleCardPackage(Context c, String pkg) {
        return pkg != null && !pkg.isEmpty()
                && !pkg.equals(c.getPackageName()) && !pkg.equals("android")
                && !pkg.equals("com.android.systemui")
                && !pkg.equals(Telephony.Sms.getDefaultSmsPackage(c))
                && !pkg.equals(GOOGLE_MESSAGES) && !pkg.equals(SAMSUNG_MESSAGES)
                && !pkg.equals("com.android.messaging") && !pkg.equals("com.android.mms");
    }
}
