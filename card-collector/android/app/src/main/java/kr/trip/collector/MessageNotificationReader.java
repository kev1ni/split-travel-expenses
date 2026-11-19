package kr.trip.collector;

import android.app.Notification;
import android.app.Person;
import android.content.Context;
import android.os.Build;
import android.os.Bundle;
import android.os.Parcelable;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;

/** Reads only the visible message carried by a notification from the user's chosen messaging app. */
final class MessageNotificationReader {
    static boolean supported(String pkg) {
        return Sources.SAMSUNG_MESSAGES.equals(pkg) || Sources.GOOGLE_MESSAGES.equals(pkg);
    }

    static final class Entry {
        final String body;
        final String senderKey;
        final long messageTime;

        Entry(String body, String senderKey, long messageTime) {
            this.body = body;
            this.senderKey = senderKey;
            this.messageTime = messageTime;
        }
    }

    static List<Entry> read(Context context, Notification n, Set<String> numbers, String displayName,
                            String issuer, long since, long postedAt) {
        Bundle extras = n.extras;
        if (extras == null || postedAt < since || n.visibility == Notification.VISIBILITY_SECRET
                || (n.flags & Notification.FLAG_GROUP_SUMMARY) != 0
                || extras.getBoolean(Notification.EXTRA_IS_GROUP_CONVERSATION)
                || (!extras.containsKey(Notification.EXTRA_IS_GROUP_CONVERSATION)
                    && !text(extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)).isEmpty())) {
            return Collections.emptyList();
        }
        if (extras.containsKey(Notification.EXTRA_MESSAGES)) {
            Parcelable[] bundles = extras.getParcelableArray(Notification.EXTRA_MESSAGES);
            if (bundles == null || bundles.length == 0) return Collections.emptyList();
            if (Build.VERSION.SDK_INT >= 28) {
                List<Notification.MessagingStyle.Message> messages;
                if (Build.VERSION.SDK_INT >= 30) {
                    messages = Notification.MessagingStyle.Message.getMessagesFromBundleArray(bundles);
                } else {
                    Notification.Style style = Notification.Builder.recoverBuilder(context, n).getStyle();
                    if (!(style instanceof Notification.MessagingStyle)) return Collections.emptyList();
                    messages = ((Notification.MessagingStyle) style).getMessages();
                }
                if (messages.size() != bundles.length) return Collections.emptyList();
                return structured(messages, numbers, displayName, issuer, since, n.when > 0 ? n.when : postedAt);
            }
            // API 26–27 exposes the title and text but cannot decode this array through a public API.
            if (bundles.length != 1) return Collections.emptyList();
        }
        CharSequence[] lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
        if (lines != null && lines.length > 1) return Collections.emptyList();
        String name = text(extras.getCharSequence(Notification.EXTRA_TITLE));
        String sender = senderKey(null, name, numbers, displayName);
        if (sender == null) return Collections.emptyList();
        String body = text(extras.getCharSequence(Notification.EXTRA_BIG_TEXT));
        if (body.isEmpty()) body = text(extras.getCharSequence(Notification.EXTRA_TEXT));
        if (body.isEmpty() && lines != null && lines.length == 1) body = text(lines[0]);
        if (!eligibleBody(sender, issuer, body)) return Collections.emptyList();
        long time = n.when > 0 ? n.when : postedAt;
        if (time < since) return Collections.emptyList();
        return Collections.singletonList(new Entry(body, sender, time));
    }

    private static List<Entry> structured(List<Notification.MessagingStyle.Message> messages,
                                          Set<String> numbers, String displayName, String issuer,
                                          long since, long postedAt) {
        List<Entry> entries = new ArrayList<>();
        String conversationSender = null;
        for (int i = 0; i < messages.size(); i++) {
            Notification.MessagingStyle.Message message = messages.get(i);
            Person person = message.getSenderPerson();
            if (person == null) continue; // A reply from the device owner.
            String sender = senderKey(person.getUri(), text(person.getName()), numbers, displayName);
            if (sender == null || (conversationSender != null && !conversationSender.equals(sender))) {
                return Collections.emptyList();
            }
            conversationSender = sender;
            long time = message.getTimestamp();
            boolean latest = i == messages.size() - 1;
            if (!latest && (since == 0 || time <= 0)) continue;
            if (time <= 0) time = postedAt;
            if (time < since) continue;
            String body = text(message.getText());
            if (eligibleBody(sender, issuer, body)) entries.add(new Entry(body, sender, time));
        }
        return entries;
    }

    private static String senderKey(String uri, String name, Set<String> numbers, String displayName) {
        String number;
        if (uri != null && uri.regionMatches(true, 0, "tel:", 0, 4)) {
            number = Sources.phone(uri.substring(4));
            if (numbers.contains(number)) return "tel:" + number;
            if (!numbers.isEmpty() || number.isEmpty()) return null;
        }
        number = Sources.phone(name);
        if (!number.isEmpty()) return numbers.contains(number) ? "tel:" + number : null;
        if (!displayName.isEmpty() && displayName.equals(name)) return "name:" + displayName;
        return null;
    }

    private static boolean eligibleBody(String sender, String issuer, String body) {
        return !body.isEmpty() && body.length() <= 8192
                && (!sender.startsWith("name:") || CardParser.matchesHyundaiNexonMessage(issuer, body));
    }

    private static String text(CharSequence value) {
        return value == null ? "" : value.toString().trim();
    }
}
