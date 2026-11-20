package kr.trip.collector;

import android.app.Activity;
import android.app.Instrumentation;
import android.app.Notification;
import android.app.Person;
import android.os.Build;
import android.os.Bundle;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Uses Android's actual notification builders with fixtures. It never posts a user's message. */
public final class MessageNotificationCheck extends Instrumentation {
    private static final String SAMPLE = "[Web발신]\n현대 넥슨 승인\n김*별\n1,400원 일시불\n"
            + "03/12 08:25\n예시마트샘플점\n누적23,700원";
    private static final String NAME = "현대카드";
    private static final Set<String> NUMBERS = Collections.singleton("15881234");
    private int checks;

    @Override public void onCreate(Bundle args) {
        super.onCreate(args);
        start();
    }

    @Override public void onStart() {
        Bundle report = new Bundle();
        try {
            if (Build.VERSION.SDK_INT < 28) throw new AssertionError("Run structured fixtures on API 28 or later");
            verify();
            report.putString("stream", "\nPASS: " + checks + " message notification checks");
            finish(Activity.RESULT_OK, report);
        } catch (Throwable error) {
            report.putString("stream", "\nFAIL: " + android.util.Log.getStackTraceString(error));
            finish(Activity.RESULT_CANCELED, report);
        }
    }

    private void verify() {
        Person sender = person(NAME, "tel:+8215881234");
        Person alias = person(NAME, null);
        Person otherNumber = person(NAME, "tel:15889999");
        Notification first = note(line(sender, SAMPLE, 1000));
        List<MessageNotificationReader.Entry> result = read(first, NUMBERS, "", 500, 1050);
        check(result.size() == 1 && result.get(0).messageTime == 1000, "approved phone in tel URI");
        Map<String, String> event = CardParser.parse(NAME, "", result.get(0).body, 1050);
        check("1400".equals(event.get("amount")) && "KRW".equals(event.get("currency"))
                && "예시마트샘플점".equals(event.get("merchant")), "Hyundai fields");
        check(read(note(line(alias, SAMPLE, 1000)), NUMBERS, NAME, 500, 1050).size() == 1, "exact display name");
        check(read(first, Collections.emptySet(), NAME, 500, 1050).size() == 1, "name-only configuration with tel metadata");
        check(read(note(line(otherNumber, SAMPLE, 1000)), NUMBERS, NAME, 500, 1050).isEmpty(), "contradictory tel URI");
        check(read(note(line(person("현대카드 안내", null), SAMPLE, 1000)), NUMBERS, NAME, 500, 1050).isEmpty(), "no substring matching");
        check(read(note(line(alias, "승인 JPY 3200", 1000)), NUMBERS, NAME, 500, 1050).isEmpty(), "pinned name also needs known issuer layout");
        check(read(note(line(null, SAMPLE, 1000)), NUMBERS, NAME, 500, 1050).isEmpty(), "outgoing reply");
        check(read(note(line(sender, SAMPLE, 1000), line(otherNumber, SAMPLE, 1100)), NUMBERS, NAME, 500, 1150).isEmpty(), "mixed senders");
        Notification group = note(line(sender, SAMPLE, 1000));
        group.extras.putBoolean(Notification.EXTRA_IS_GROUP_CONVERSATION, true);
        check(read(group, NUMBERS, NAME, 500, 1050).isEmpty(), "group conversation");
        Notification summary = note(line(sender, SAMPLE, 1000));
        summary.flags |= Notification.FLAG_GROUP_SUMMARY;
        check(read(summary, NUMBERS, NAME, 500, 1050).isEmpty(), "group summary");
        Notification secret = note(line(sender, SAMPLE, 1000));
        secret.visibility = Notification.VISIBILITY_SECRET;
        check(read(secret, NUMBERS, NAME, 500, 1050).isEmpty(), "secret notification");
        Notification history = note(line(sender, SAMPLE, 300), line(sender, SAMPLE, 1000), line(sender, SAMPLE, 1110));
        result = read(history, NUMBERS, "", 500, 1250);
        check(result.size() == 2 && result.get(0).messageTime == 1000 && result.get(1).messageTime == 1110,
                "two purchases preserved; messages before opt-in omitted");
        List<MessageNotificationReader.Entry> replay = read(history, NUMBERS, "", 500, 1370);
        check(replay.get(0).messageTime == result.get(0).messageTime &&
                replay.get(0).senderKey.equals(result.get(0).senderKey) &&
                replay.get(0).body.equals(result.get(0).body), "reposted notification has identical source identity");
        check(read(history, NUMBERS, "", 0, 1250).size() == 1, "without consent time use newest only");
        Notification plain = builder().setContentTitle("1588-1234").setContentText(SAMPLE).build();
        check(read(plain, NUMBERS, "", 500, 1050).size() == 1, "plain exact sender notification");
        plain.extras.putCharSequenceArray(Notification.EXTRA_TEXT_LINES, new CharSequence[]{SAMPLE, SAMPLE});
        check(read(plain, NUMBERS, "", 500, 1050).isEmpty(), "ambiguous plain inbox");
        check(MessageNotificationReader.supported("com.samsung.android.messaging") &&
                MessageNotificationReader.supported("com.google.android.apps.messaging") &&
                !MessageNotificationReader.supported("com.google.android.apps.messaging.fake"), "messenger allowlist");
    }

    private List<MessageNotificationReader.Entry> read(Notification n, Set<String> numbers, String alias,
                                                       long since, long posted) {
        return MessageNotificationReader.read(getTargetContext(), n, numbers, alias, NAME, since, posted);
    }

    private Notification.Builder builder() {
        return new Notification.Builder(getTargetContext(), "test").setSmallIcon(android.R.drawable.ic_dialog_info)
                .setWhen(1000).setCategory(Notification.CATEGORY_MESSAGE);
    }

    private Notification note(Notification.MessagingStyle.Message... messages) {
        Notification.MessagingStyle style = new Notification.MessagingStyle(person("테스트 사용자", null));
        style.setGroupConversation(false);
        for (Notification.MessagingStyle.Message m : messages) style.addMessage(m);
        return builder().setStyle(style).build();
    }

    private static Notification.MessagingStyle.Message line(Person person, String body, long time) {
        return new Notification.MessagingStyle.Message(body, time, person);
    }

    private static Person person(String name, String uri) {
        return new Person.Builder().setName(name).setUri(uri).build();
    }

    private void check(boolean ok, String label) {
        if (!ok) throw new AssertionError(label);
        checks++;
    }
}
