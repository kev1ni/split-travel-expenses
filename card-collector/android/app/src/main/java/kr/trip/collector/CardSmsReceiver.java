package kr.trip.collector;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.provider.Telephony;
import android.telephony.SmsMessage;

import java.util.Set;

public final class CardSmsReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (!Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;
        SharedPreferences prefs = Sources.prefs(context);
        if (!prefs.getBoolean("enabled", false) || !prefs.getString("message_package", "").isEmpty()) return;
        Set<String> allowed = Sources.phoneList(prefs.getString("sms_senders", ""));
        if (allowed.isEmpty()) return;
        SmsMessage[] parts = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (parts == null || parts.length == 0 || parts[0] == null) return;
        String sender = Sources.phone(parts[0].getOriginatingAddress());
        if (!allowed.contains(sender)) return;

        StringBuilder body = new StringBuilder();
        for (SmsMessage part : parts) {
            if (part == null || !sender.equals(Sources.phone(part.getOriginatingAddress()))) return;
            String segment = part.getMessageBody();
            if (segment == null) return;
            body.append(segment);
        }
        CollectorStore.capture(context, "message", "sms", prefs.getString("issuer", ""),
                "", body.toString(), System.currentTimeMillis(), null);
    }
}
