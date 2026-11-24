package kr.trip.collector;

import android.content.Context;
import android.content.SharedPreferences;
import android.provider.Telephony;

final class Sources {
    static final String SAMSUNG_MESSAGES = "com.samsung.android.messaging";
    static final String GOOGLE_MESSAGES = "com.google.android.apps.messaging";

    private Sources() {}

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences("collector", Context.MODE_PRIVATE);
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
