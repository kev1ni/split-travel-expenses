"""Test Google Messages notification capture on a disposable AVD. No carrier RCS is sent."""

import argparse
import base64
import json
import re
import shlex
import sqlite3
import subprocess
import tempfile
import time
from contextlib import closing
from pathlib import Path

from emulator_smoke import APK, PACKAGE


MESSAGES = "com.google.android.apps.messaging"
LISTENER = PACKAGE + "/.CardNotificationListener"
BODY = "[Web발신]\n현대 넥슨 승인\n김*별\n1,400원 일시불\n03/12 08:25\n예시마트샘플점\n누적23,700원"
OTHER_BODY = BODY.replace("1,400원", "2,700원").replace("예시마트샘플점", "테스트문구점")


def events(adb):
    # Read only this test package's structured outbox, including its WAL when present.
    with tempfile.TemporaryDirectory() as temp:
        snapshot = Path(temp) / "outbox.db"
        for suffix in ("", "-wal"):
            result = adb("exec-out", "run-as", PACKAGE, "cat", "databases/card-outbox.db" + suffix,
                         check=False)
            if suffix == "" and not result.stdout.startswith(b"SQLite format 3\0"):
                raise RuntimeError("The collector's private outbox could not be opened")
            valid_wal = result.stdout[:4] in (bytes.fromhex("377f0682"), bytes.fromhex("377f0683"))
            if not suffix or valid_wal:
                Path(str(snapshot) + suffix).write_bytes(result.stdout)
        with closing(sqlite3.connect(snapshot)) as conn:
            return [(json.loads(payload), state) for payload, state in
                    conn.execute("SELECT payload, state FROM events ORDER BY rowid")]


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--device", required=True, help="Fresh, disposable emulator, such as emulator-5554")
    cli.add_argument("--adb", default="adb")
    cli.add_argument("--sender", default="15881234", help="Allowed synthetic sender (e.g. +16505550170)")
    cli.add_argument("--other-sender", default="15889999", help="Different synthetic sender")
    args = cli.parse_args()
    if not re.fullmatch(r"emulator-\d+", args.device):
        cli.error("Only disposable Android emulators are supported")
    for number in (args.sender, args.other_sender):
        if not re.fullmatch(r"\+?[0-9]{3,15}", number):
            cli.error("Pass full emitter numbers with optional leading +")
    if args.sender.lstrip("+") == args.other_sender.lstrip("+"):
        cli.error("The two senders must differ")

    def adb(*command, check=True):
        return subprocess.run([args.adb, "-s", args.device, *command], capture_output=True,
                              timeout=90, check=check)

    def shell(*command, check=True):
        return adb("shell", shlex.join(command), check=check).stdout.decode("utf-8", "replace").strip()

    def send(number, text):
        # The emulator console expands \n and \uNNNN before forming SMS DELIVER segments.
        escaped = text.encode("unicode_escape").decode("ascii")
        response = adb("emu", "sms", "send", number, escaped).stdout.splitlines()
        if not any(line.strip() == b"OK" for line in response):
            raise RuntimeError("The emulator modem rejected the Unicode SMS")

    def sees_fixture(marker):
        keys = shell("cmd", "notification", "list").splitlines()
        for key in keys:
            if f"|{MESSAGES}|" in key and marker in shell("cmd", "notification", "get", key, check=False):
                return True
        return False

    if shell("getprop", "ro.boot.qemu") != "1" or shell("getprop", "sys.boot_completed") != "1":
        cli.error("Wait for a disposable AVD to finish booting")
    if shell("pm", "list", "packages", PACKAGE):
        cli.error("Use a clean AVD with no prior collector installation")
    role = shell("cmd", "role", "get-role-holders", "--user", "0", "android.app.role.SMS", check=False)
    if MESSAGES not in role.splitlines():
        target = shell("cmd", "package", "resolve-activity", "--brief", "-a",
                       "android.intent.action.SENDTO", "-d", "smsto:15881234")
        if not any(line.startswith(MESSAGES + "/") for line in target.splitlines()):
            cli.error("Select Google Messages as the default SMS app, then rerun on the clean AVD")

    adb("install", "-g", str(APK))
    if int(shell("getprop", "ro.build.version.sdk")) >= 33:
        shell("pm", "grant", MESSAGES, "android.permission.POST_NOTIFICATIONS")
    prefs = ('<map><boolean name="enabled" value="true"/>'
             f'<string name="issuer">현대카드</string><string name="sms_senders">{args.sender}</string>'
             f'<string name="message_package">{MESSAGES}</string></map>')
    encoded = base64.b64encode(prefs.encode("utf-8")).decode("ascii")
    shell("run-as", PACKAGE, "mkdir", "-p", "shared_prefs")
    shell("run-as", PACKAGE, "sh", "-c", f"echo {encoded} | base64 -d > shared_prefs/collector.xml")
    print(shell("am", "start", "-W", "-n", PACKAGE + "/.MainActivity"), flush=True)
    shell("cmd", "notification", "allow_listener", LISTENER)
    try:
        time.sleep(2)
        send(args.sender, BODY)
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            if events(adb):
                break
            time.sleep(2)
        else:
            raise RuntimeError("No positive event. Google Messages posted the fixture: "
                               + str(sees_fixture("예시마트샘플점")))

        send(args.other_sender, OTHER_BODY)
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            if sees_fixture("테스트문구점"):
                break
            time.sleep(2)
        else:
            raise RuntimeError("Google Messages did not display the distinct rejected-sender fixture")
        time.sleep(5)  # Let the notification listener and SMS broadcast settle.
        rows = events(adb)
        if len(rows) != 1:
            raise AssertionError(f"Expected just one event, got {[(e['source'], e['amount']) for e, _ in rows]}")
        event, state = rows[0]
        expected = {"issuer": "현대카드", "source": "message", "message_format": None,
                    "amount": "1400", "currency": "KRW", "event_type": "approval",
                    "merchant": "예시마트샘플점", "occurred_at": None, "approval_ref": None}
        if state != "local" or any(key not in event or event[key] != v for key, v in expected.items()):
            raise AssertionError(f"Wrong route, payload or duplicate protection: {event}, {state}")
        print(json.dumps(event, ensure_ascii=False, indent=2))
        print("PASS: Google Messages notification → one event; other sender rejected. "
              "Transport on the emulator was SMS, not carrier RCS.")
    finally:
        shell("cmd", "notification", "disallow_listener", LISTENER)


if __name__ == "__main__":
    main()
