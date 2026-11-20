"""Exercise the signed sender with Windows ICU and modeled native file/HTTP actions."""

import hashlib
import json
import re
import sys
import unittest
from uuid import UUID

from build_sender import IOS, NAME, make_workflow

sys.path.insert(0, str(IOS.parent / "tests"))
from ios_shortcut_cases import IcuRegex, SAMPLE
from verify_ios_archive import load_signed_workflow


def icu_find(pattern, value):
    expr = IcuRegex(pattern)
    try:
        return expr.match(str(value or ""))
    finally:
        expr.close()


def execute(workflow, incoming, url="https://team.example/api/collector/events", token="example-only-token-12345",
            ack=True, manual=False, random_start=10):
    store, frames, effects = {}, [], []
    enabled, last = True, None
    answers = {0: url, 1: token}

    def variable(value):
        if value.get("Type") == "ExtensionInput":
            return None if manual else incoming
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
    @classmethod
    def setUpClass(cls):
        cls.workflow = load_signed_workflow(IOS / "배포용" / (NAME + ".shortcut"))

    def test_signed_workflow(self):
        expected = make_workflow()
        for key in ("WFWorkflowActions", "WFWorkflowImportQuestions", "WFWorkflowTypes", "WFWorkflowInputContentItemClasses"):
            self.assertEqual(self.workflow[key], expected[key])

    def test_receive_and_retry(self):
        for text in (SAMPLE, SAMPLE.replace("\n", " "), SAMPLE.replace("마트", "마트\t")):
            first = execute(self.workflow, text)
            self.assertEqual([e[0] for e in first], ["save", "post", "notify"])
            _, filename, saved = first[0]
            data = json.loads(first[1][3])
            self.assertEqual(UUID(data["event_id"]).version, 4)
            self.assertEqual(filename, f"NTrip-{data['event_id']}.txt")
            self.assertEqual(data["amount"], "1400")
            self.assertEqual(data["merchant"], "예시마트 샘플점" if "\t" in text else "예시마트샘플점")
            self.assertIsNone(data["occurred_at"])
            self.assertEqual(first[1][2], {"Authorization": "Bearer example-only-token-12345", "Content-Type": "application/json"})
            for private in ("김*별", "누적", "example-only-token", "https://"):
                self.assertNotIn(private, saved)
            for manual in (True, False):
                retried = execute(self.workflow, saved, manual=manual)
                self.assertEqual(retried, first[1:])
            self.assertNotEqual(json.loads(execute(self.workflow, text, random_start=20)[1][3])["event_id"], data["event_id"])
            for kwargs in ({"token": "new-different-member-token"}, {"url": "https://another.example/api/collector/events"}):
                self.assertFalse(execute(self.workflow, saved, **kwargs))
            self.assertNotIn(("notify", "여행의 카드 알림에 저장했어요."), execute(self.workflow, saved, ack=False))

    def test_rejections(self):
        for text in (SAMPLE.replace("승인", "승인거절"), "인증번호 123456", SAMPLE + "\n" + SAMPLE):
            self.assertEqual(execute(self.workflow, text), [])
        for kwargs in ({"url": "http://host/api/collector/events"}, {"url": "https://user:pass@host/api/collector/events"},
                       {"token": ""}, {"token": "invalid\nheader-injection"}):
            self.assertEqual([e[0] for e in execute(self.workflow, SAMPLE, **kwargs)], ["notify"])


if __name__ == "__main__":
    unittest.main()
