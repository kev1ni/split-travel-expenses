"""Verify selected-app push collection and SMS exclusion on a disposable, clean AVD."""

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


PACKAGE = "kr.trip.collector"
ROOT = Path(__file__).resolve().parents[1]
APK = ROOT / "android/app/build/outputs/apk/debug/app-debug.apk"
MESSAGE = "approved JPY 3200 merchant: SORA MART approval ref: 00123456"


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--device", required=True, help="Disposable emulator, such as emulator-5554")
    cli.add_argument("--adb", default="adb")
    cli.add_argument("--apk", type=Path, default=APK, help="Debuggable collector APK to install")
    args = cli.parse_args()
    if not re.fullmatch(r"emulator-[0-9]+", args.device):
        cli.error("Use a disposable Android emulator")

    def adb(*command, check=True):
        return subprocess.run([args.adb, "-s", args.device, *command], capture_output=True,
                              timeout=60, check=check)

    def shell(*command):
        return adb("shell", shlex.join(command)).stdout.decode().strip()

    if shell("getprop", "ro.boot.qemu") != "1" or shell("getprop", "sys.boot_completed") != "1":
        cli.error("Start the test emulator and wait for Android to finish booting")
    if shell("pm", "list", "packages", PACKAGE).strip():
        cli.error("Use a clean emulator without a previous collector installation")
    adb("install", str(args.apk))
    package_info = shell("dumpsys", "package", PACKAGE)
    assert all(permission not in package_info for permission in
               ("android.permission.RECEIVE_SMS", "android.permission.READ_SMS")), "Unexpected SMS permission"
    # Test-only fixture for the debuggable APK. A blank endpoint enforces device-only capture.
    prefs = ('<map><boolean name="enabled" value="true"/>'
             '<string name="issuer">Demo</string><string name="sms_senders">15881234</string>'
             '<string name="card_package">com.android.shell</string></map>')
    encoded = base64.b64encode(prefs.encode()).decode()
    shell("run-as", PACKAGE, "mkdir", "-p", "shared_prefs")
    shell("run-as", PACKAGE, "sh", "-c", f"echo {encoded} | base64 -d > shared_prefs/collector.xml")
    print(shell("am", "start", "-W", "-n", PACKAGE + "/.MainActivity"), flush=True)
    shell("cmd", "notification", "allow_listener", PACKAGE + "/.CardNotificationListener")
    time.sleep(2)

    def sms(number, message):
        response = adb("emu", "sms", "send", number, message).stdout
        if b"OK" not in response:
            raise RuntimeError("Emulator console rejected the SMS fixture")

    try:
        # Even a sender previously allowed on v0.3 must not create an event.
        sms_ref = str(time.time_ns())[-8:]
        sms("15881234", f"approved JPY 7777 merchant: SORA MART approval ref: {sms_ref}")
        shell("cmd", "notification", "post", "-t", "Demo", "travel-fixture", MESSAGE)
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            inbox = shell("content", "query", "--uri", "content://sms/inbox", "--projection", "_id",
                          "--where", f"address='15881234' AND body LIKE '%{sms_ref}%'")
            if "Row: " in inbox:
                break
            time.sleep(2)
        else:
            raise RuntimeError("Test SMS did not reach the emulator's messaging inbox")
        with tempfile.TemporaryDirectory() as folder:
            snapshot = Path(folder) / "events.db"
            deadline = time.monotonic() + 40
            rows = []
            first_event_at = None
            while time.monotonic() < deadline:
                time.sleep(2)
                for suffix in ("", "-wal"):
                    result = adb("exec-out", "run-as", PACKAGE, "cat",
                                 "databases/card-outbox.db" + suffix, check=False)
                    dest = Path(str(snapshot) + suffix)
                    header = result.stdout[:4]
                    valid = header == b"SQLi" if not suffix else header in (b"7\x7f\x06\x82", b"7\x7f\x06\x83")
                    if result.returncode == 0 and valid:
                        dest.write_bytes(result.stdout)
                    else:
                        dest.unlink(missing_ok=True)
                if snapshot.exists():
                    with closing(sqlite3.connect(snapshot)) as conn:
                        rows = conn.execute("SELECT payload, state FROM events ORDER BY rowid").fetchall()
                    if rows and first_event_at is None:
                        first_event_at = time.monotonic()
                    # Give asynchronous SMS delivery time to reveal an unexpected second event.
                    if first_event_at is not None and time.monotonic() - first_event_at >= 5:
                        break
        events = [json.loads(payload) for payload, state in rows if state == "local"]
        assert len(rows) == len(events) == 1, [(e["source"], e["amount"]) for e in events]
        event = events[0]
        assert event["source"] == "app_push" and event["message_format"] is None and event["event_id"]
        assert event["currency"] == "JPY" and event["amount"] == "3200"
        assert event["approval_ref"] == "00123456" and event["event_type"] == "approval"
        print(json.dumps(events, indent=2))
        print("PASS: captured selected app push once and ignored SMS from the formerly allowed sender.")
    finally:
        shell("cmd", "notification", "disallow_listener", PACKAGE + "/.CardNotificationListener")


if __name__ == "__main__":
    main()
