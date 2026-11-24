"""Exercise the generated push sender with Windows ICU and modeled native file/HTTP actions."""

import hashlib
import json
import plistlib
import re
import sys
import unittest
from uuid import UUID

from build_sender import IOS, SOURCE, make_workflow

sys.path.insert(0, str(IOS.parent / "tests"))
from ios_shortcut_cases import IcuRegex


def icu_find(pattern, value):
    expr = IcuRegex(pattern)
    try:
        return expr.match(str(value or ""))
    finally:
        expr.close()


def execute(workflow, incoming, url="https://team.example/api/collector/events", token="example-only-token-12345",
            ack=True, issuer="데모카드", random_start=10):
    store, frames, effects = {}, [], []
    enabled, last = True, None
    answers = {0: url, 1: token, 2: issuer}

    def variable(value):
        if value.get("Type") == "ExtensionInput":
            return incoming
        return store[value["OutputUUID"]]

    def resolve(value):
        if not isinstance(value, dict):
            return value
        data = value["Value"]
        if value["WFSerializationType"] == "WFTextTokenAttachment":
            return variable(data)
        text = data["string"].encode("utf-16le")
        entries = sorted(data["attachmentsByRange"].items(), key=lambda row: int(row[0][1:].split(",")[0]), reverse=True)
        for span, ref in entries:
            pos = int(span[1:].split(",")[0]) * 2
            assert text[pos:pos+2] == b"\xfc\xff"
            text = text[:pos] + str(variable(ref)).encode("utf-16le") + text[pos+2:]
        return text.decode("utf-16le")

    for index, item in enumerate(workflow["WFWorkflowActions"]):
        name = item["WFWorkflowActionIdentifier"].removeprefix("is.workflow.actions.")
        p = item["WFWorkflowActionParameters"]
        if name == "conditional":
            mode = p["WFControlFlowMode"]
            if mode == 0:
                match = enabled and bool(resolve(p["WFInput"]["Variable"])) == (p["WFCondition"] == 100)
                frames.append((enabled, match))
                enabled = match
            elif mode == 1:
                parent, match = frames[-1]
                enabled = parent and not match
            elif mode == 2:
                enabled, _ = frames.pop()
                if enabled:
                    store[p["UUID"]] = last
            continue
        if not enabled:
            continue
        if name == "gettext":
            last = answers[index] if index in answers else resolve(p["WFTextActionText"])
        elif name == "text.match":
            last = icu_find(resolve(p["WFMatchTextPattern"]), resolve(p["text"]))
        elif name == "text.match.getgroup":
            last = resolve(p["matches"])[p["WFGroupIndex"]]
        elif name == "text.replace":
            text, pattern, replacement = resolve(p["WFInput"]), p["WFReplaceTextFind"], p["WFReplaceTextReplace"]
            if p["WFReplaceTextRegularExpression"]:
                groups = icu_find(pattern, text)
                assert groups and groups[0] == text
                last = re.sub(r"\$(\d+)", lambda m: groups[int(m[1])], replacement)
            else:
                last = text.replace(pattern, replacement)
        elif name == "ask":
            assert manual
            last = incoming
        elif name == "detect.text":
            last = resolve(p["WFInput"])
        elif name == "date":
            last = "2026-03-12T08:25:01+09:00"
        elif name == "format.date":
            assert p["WFISO8601IncludeTime"] and p["WFDateFormatStyle"] == "ISO 8601"
            last = resolve(p["WFDate"])
        elif name == "number.random":
            random_start += 1
            last = random_start
        elif name == "hash":
            assert p["WFHashType"] == "SHA256"
            last = hashlib.sha256(resolve(p["WFInput"]).encode()).hexdigest()
        elif name == "documentpicker.save":
            assert not p["WFAskWhereToSave"] and not p["WFSaveFileOverwrite"]
            last = resolve(p["WFInput"])
            effects.append(("save", resolve(p["WFFileDestinationPath"]), last))
        elif name == "downloadurl":
            assert p["WFHTTPMethod"] == "POST" and p["WFHTTPBodyType"] == "File"
            headers = {resolve(h["WFKey"]): resolve(h["WFValue"])
                       for h in p["WFHTTPHeaders"]["Value"]["WFDictionaryFieldValueItems"]}
            data = resolve(p["WFRequestVariable"])
            effects.append(("post", resolve(p["WFURL"]), headers, data))
            last = {"card_event": {"event_id": json.loads(data)["event_id"] if ack else "wrong"}}
        elif name == "getvalueforkey":
            last = resolve(p["WFInput"])[p["WFDictionaryKey"]]
        elif name == "notification":
            effects.append(("notify", p["WFNotificationActionBody"]))
        elif name == "exit":
            break
        else:
            raise ValueError(name)
        store[p["UUID"]] = last
    return effects


class TestSender(unittest.TestCase):
    push = "해외승인 JPY 3,200 가맹점: SORA MART 승인번호: 00123456"

    @classmethod
    def setUpClass(cls):
        cls.workflow = plistlib.loads(SOURCE.read_bytes())

    def test_build_reproducible(self):
        self.assertEqual(SOURCE.read_bytes(), plistlib.dumps(make_workflow(), fmt=plistlib.FMT_BINARY, sort_keys=False))
        self.assertEqual(self.workflow["WFWorkflowTypes"], [])

    def test_approval_receipt(self):
        effects = execute(self.workflow, self.push)
        self.assertEqual([e[0] for e in effects], ["save", "post", "notify"])
        _, filename, saved = effects[0]
        _, url, headers, body = effects[1]
        data = json.loads(body)
        self.assertEqual(UUID(data.pop("event_id")).version, 4)
        self.assertEqual(filename, "NTrip-" + json.loads(body)["event_id"] + ".txt")
        self.assertEqual(data, {"source": "app_push", "message_format": None, "issuer": "데모카드",
                                "event_type": "approval", "amount": "3200", "currency": "JPY",
                                "merchant": "SORA MART", "approval_ref": "00123456", "occurred_at": None,
                                "received_at": "2026-03-12T08:25:01+09:00"})
        self.assertEqual(headers, {"Authorization": "Bearer example-only-token-12345", "Content-Type": "application/json"})
        self.assertEqual(url, "https://team.example/api/collector/events")
        self.assertNotIn("example-only-token", saved)
        self.assertNotIn(self.push, saved)
        self.assertNotEqual(execute(self.workflow, self.push, random_start=100)[1][3], body)

    def test_replay_uses_original_uuid_and_account(self):
        saved, post, notify = execute(self.workflow, self.push)
        self.assertEqual(execute(self.workflow, saved[2]), [post, notify])
        for kwargs in ({"token": "new-different-member-token"}, {"url": "https://second.example/api/collector/events"},
                       {"issuer": "다른카드"}):
            self.assertEqual(execute(self.workflow, saved[2], **kwargs), [])
        self.assertNotIn(notify, execute(self.workflow, saved[2], ack=False))

    def test_currencies_optional_ref_and_cancellation(self):
        for message, kind, amount, currency, merchant in (
            ("승인 KRW 1,400\n가맹점: 시연 편의점", "approval", "1400", "KRW", "시연 편의점"),
            ("국내승인\n결제금액: 1,400원\n가맹점: 시연 편의점", "approval", "1400", "KRW", "시연 편의점"),
            ("승인\n결제금액: USD 12.50\n가맹점: Corner Market", "approval", "12.50", "USD", "Corner Market"),
            ("국내취소 KRW 1,400 가맹점: 시연 편의점", "cancel", "1400", "KRW", "시연 편의점"),
            ("해외승인취소 USD 12.50 가맹점: A&B", "cancel", "12.50", "USD", "A&B"),
            ("승인 EUR 0.09 가맹점: Cafe", "approval", "0.09", "EUR", "Cafe"),
        ):
            with self.subTest(message=message):
                data = json.loads(execute(self.workflow, message)[1][3])
                self.assertEqual((data["event_type"], data["amount"], data["currency"], data["merchant"]),
                                 (kind, amount, currency, merchant))
                self.assertIsNone(data["approval_ref"])

    def test_unsupported_content_is_ignored(self):
        for text in (None, "", "[Web발신]\n현대 넥슨 승인\n김*별\n1,400원 일시불\n예시마트",
                     "인증번호 123456", self.push.replace("승인 JPY", "승인거절 JPY"),
                     self.push.replace("3,200", "3,2"), self.push.replace("3,200", "0"),
                     self.push.replace("3,200", "0.00"), self.push.replace("3,200", "3.25"),
                     self.push.replace("JPY", "GBP"), self.push.replace("SORA MART", '"SORA"'),
                     self.push + "\n누적 5,200원", self.push + "\n" + self.push):
            with self.subTest(text=text):
                self.assertEqual(execute(self.workflow, text), [])

    def test_invalid_setup_stops_before_file_and_http(self):
        for kwargs in ({"url": "http://host/api/collector/events"}, {"url": "https://user:pass@host/api/collector/events"},
                       {"token": "invalid\nheader-injection"}, {"issuer": '"bad"'}):
            self.assertEqual([e[0] for e in execute(self.workflow, self.push, **kwargs)], ["notify"])


if __name__ == "__main__":
    unittest.main()
