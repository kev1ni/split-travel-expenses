package kr.trip.collector;

import android.content.Context;
import android.content.SharedPreferences;
import android.provider.Telephony;

import java.util.LinkedHashSet;
import java.util.Set;

final class Sources {
    static final String SAMSUNG_MESSAGES = "com.samsung.android.messaging";
    static final String GOOGLE_MESSAGES = "com.google.android.apps.messaging";

    private Sources() {}

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences("collector", Context.MODE_PRIVATE);
    }

    static String phone(String raw) {
        if (raw == null) return "";
        String compact = raw.trim().replaceAll("[\\s().-]", "");
        if (!compact.matches("\\+?[0-9]{3,15}")) return "";
        if (compact.startsWith("0082")) compact = "+82" + compact.substring(4);
        if (compact.startsWith("+82")) {
            String national = compact.substring(3);
            if (national.matches("1[568][0-9]{6}")) return national;
            if (!national.startsWith("0")) return "0" + national;
            return national;
        }
        return compact;
    }

    static Set<String> phoneList(String raw) {
        Set<String> phones = new LinkedHashSet<>();
        for (String entry : raw.split("[,;\\n]")) {
            if (entry.trim().isEmpty()) continue;
            String normalized = phone(entry);
            if (normalized.isEmpty()) throw new IllegalArgumentException(entry.trim());
            phones.add(normalized);
        }
        return phones;
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
