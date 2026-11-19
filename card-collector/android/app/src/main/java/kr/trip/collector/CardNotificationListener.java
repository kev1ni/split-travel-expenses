package kr.trip.collector;

import android.app.Notification;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.BadParcelableException;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

public final class CardNotificationListener extends NotificationListenerService {
    @Override public void onNotificationPosted(StatusBarNotification posted) {
        SharedPreferences prefs = Sources.prefs(this);
        if (!prefs.getBoolean("enabled", false) || posted == null) return;
        String pkg = posted.getPackageName();
        Notification notice = posted.getNotification();
        if (notice == null || (notice.flags & Notification.FLAG_GROUP_SUMMARY) != 0 || notice.extras == null) return;
        if (MessageNotificationReader.supported(pkg)) {
            if (!pkg.equals(prefs.getString("message_package", ""))) return;
            String issuer = prefs.getString("issuer", "");
            try {
                for (MessageNotificationReader.Entry message : MessageNotificationReader.read(this, notice,
                        Sources.phoneList(prefs.getString("sms_senders", "")), prefs.getString("message_sender_name", ""),
                        issuer, prefs.getLong("message_since", 0), posted.getPostTime())) {
                    // MessagingStyle does not expose whether a message used SMS or RCS.
                    CollectorStore.capture(this, "message", null, issuer, "", message.body, posted.getPostTime(),
                            "message|" + pkg + "|" + message.senderKey, message.messageTime);
                }
            } catch (BadParcelableException | ClassCastException e) {
                // Incompatible extras from an OEM message app cannot safely identify a sender.
            }
            return;
        }
        if (!pkg.equals(prefs.getString("card_package", "")) || !Sources.isEligibleCardPackage(this, pkg)) return;

        Bundle extras = notice.extras;
        String title = asText(extras.getCharSequence(Notification.EXTRA_TITLE));
        String body = asText(extras.getCharSequence(Notification.EXTRA_BIG_TEXT));
        if (body.isEmpty()) {
            CharSequence[] lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
            if (lines != null && lines.length > 1) {
                // An inbox-style notification may summarize multiple payments.
                return;
            }
            body = asText(extras.getCharSequence(Notification.EXTRA_TEXT));
            if (body.isEmpty() && lines != null && lines.length == 1) body = asText(lines[0]);
        }
        if (title.isEmpty() && body.isEmpty()) return;
        CollectorStore.capture(this, "app_push", null, prefs.getString("issuer", ""),
                title, body, posted.getPostTime(), posted.getKey() + "|" + posted.getPostTime());
    }

    private static String asText(CharSequence value) {
        return value == null ? "" : value.toString().trim();
    }
}
