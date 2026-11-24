"""Exercise Android's SMS and notification routes on a disposable, initially clean AVD."""

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
    adb("install", "-g", str(APK))
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
        sms("15889999", MESSAGE)
        sms("15881234", "OTP approved JPY 7777")
        sms("15881234", MESSAGE)
        shell("cmd", "notification", "post", "-t", "Demo", "travel-fixture", MESSAGE)
        with tempfile.TemporaryDirectory() as folder:
            snapshot = Path(folder) / "events.db"
            deadline = time.monotonic() + 40
            rows = []
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
                    if len(rows) >= 2:
                        break
        events = [json.loads(payload) for payload, state in rows if state == "local"]
        assert len(rows) == len(events) == 2, [(e["source"], e["amount"]) for e in events]
        assert {(e["source"], e["message_format"]) for e in events} == {("message", "sms"), ("app_push", None)}
        assert len({e["event_id"] for e in events}) == 2
        assert all(e["currency"] == "JPY" and e["amount"] == "3200" and
                   e["approval_ref"] == "00123456" and e["event_type"] == "approval" for e in events)
        print(json.dumps(events, indent=2))
        print("PASS: independent SMS and push events; other sender and OTP ignored.")
    finally:
        shell("cmd", "notification", "disallow_listener", PACKAGE + "/.CardNotificationListener")


if __name__ == "__main__":
    main()
