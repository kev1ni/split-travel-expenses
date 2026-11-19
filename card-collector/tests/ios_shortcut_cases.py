"""Exercise the distributed Hyundai workflow with Windows ICU and modeled Shortcuts actions."""

import ctypes as c
from pathlib import Path

from verify_ios_archive import load_signed_workflow


IOS_DIR = Path(__file__).resolve().parents[1] / "ios"
SAMPLE = "[Web발신]\n현대 넥슨 승인\n김*별\n1,400원 일시불\n03/12 08:25\n예시마트샘플점\n누적23,700원"
EXPECTED = "1,400원 · 예시마트샘플점"


class IcuRegex:
    def __init__(self, pattern):
        self.icu = c.CDLL("icu.dll")
        status = c.POINTER(c.c_int32)
        for name, args, result in (
            ("uregex_open", [c.c_void_p, c.c_int32, c.c_uint32, c.c_void_p, status], c.c_void_p),
            ("uregex_setText", [c.c_void_p, c.c_void_p, c.c_int32, status], None),
            ("uregex_find", [c.c_void_p, c.c_int32, status], c.c_int8),
            ("uregex_groupCount", [c.c_void_p, status], c.c_int32),
            ("uregex_start", [c.c_void_p, c.c_int32, status], c.c_int32),
            ("uregex_end", [c.c_void_p, c.c_int32, status], c.c_int32),
            ("uregex_close", [c.c_void_p], None),
        ):
            fn = getattr(self.icu, name)
            fn.argtypes = args
            fn.restype = result
        p = pattern.encode("utf-16-le")
        self.expr = self.call("uregex_open", p, len(p) // 2, 0, None)

    def call(self, name, *args):
        err = c.c_int32()
        value = getattr(self.icu, name)(*args, c.byref(err))
        if err.value > 0:
            raise ValueError(f"{name} returned ICU error {err.value}")
        return value

    def match(self, text):
        data = text.encode("utf-16-le")
        self.call("uregex_setText", self.expr, data, len(data) // 2)
        if not self.call("uregex_find", self.expr, 0):
            return []
        groups = []
        for index in range(self.call("uregex_groupCount", self.expr) + 1):
            lo = self.call("uregex_start", self.expr, index)
            hi = self.call("uregex_end", self.expr, index)
            groups.append(data[lo * 2 : hi * 2].decode("utf-16-le"))
        return groups

    def close(self):
        self.icu.uregex_close(self.expr)


def run_actions(actions, incoming, answer, regex):
    outputs, effects, frames = {}, [], []
    active, last = True, None

    def variable(token):
        if token["Type"] == "ExtensionInput":
            return incoming
        if token["Type"] == "ActionOutput":
            return outputs[token["OutputUUID"]]
        raise ValueError(f"Unsupported variable: {token['Type']}")

    def resolve(param):
        if isinstance(param, str):
            return param
        if param.get("Type") == "Variable":
            return resolve(param["Variable"])
        value = param["Value"]
        if param["WFSerializationType"] == "WFTextTokenAttachment":
            return variable(value)
        assert param["WFSerializationType"] == "WFTextTokenString"
        buf = value["string"].encode("utf-16-le")
        ranges = [(int(span.strip("{}").split(",")[0]), token) for span, token in value["attachmentsByRange"].items()]
        for offset, token in sorted(ranges, key=lambda item: item[0], reverse=True):
            pos = 2 * offset
            assert buf[pos:pos+2] == "\ufffc".encode("utf-16-le")
            buf = buf[:pos] + variable(token).encode("utf-16-le") + buf[pos+2:]
        return buf.decode("utf-16-le")

    for action in actions:
        name = action["WFWorkflowActionIdentifier"].removeprefix("is.workflow.actions.")
        p = action["WFWorkflowActionParameters"]
        if name == "conditional":
            mode, group = p["WFControlFlowMode"], p["GroupingIdentifier"]
            if mode == 0:
                assert p["WFCondition"] in (100, 101)
                condition = active and (bool(resolve(p["WFInput"])) == (p["WFCondition"] == 100))
                frames.append((group, active, condition))
                active = condition
            elif mode == 1:
                frame_group, parent, condition = frames[-1]
                assert frame_group == group
                active = parent and not condition
            else:
                frame_group, active, _ = frames.pop()
                assert mode == 2 and frame_group == group
                if active and "UUID" in p:
                    outputs[p["UUID"]] = last
            continue
        if not active:
            continue
        if name == "ask":
            assert p["WFInputType"] == "Text" and p["WFAllowsMultilineText"]
            effects.append(("prompt",))
            last = p["WFAskActionDefaultAnswer"] if answer is None else answer
        elif name == "gettext":
            last = resolve(p["WFTextActionText"])
        elif name == "text.match":
            last = regex.match(resolve(p["text"]))
        elif name == "text.match.getgroup":
            assert p["WFGetGroupType"] == "Group At Index"
            last = resolve(p["matches"])[p["WFGroupIndex"]]
        elif name == "showresult":
            effects.append(("display", resolve(p["Text"])))
        elif name == "notification":
            effects.append(("notify", resolve(p["WFNotificationActionTitle"]), resolve(p["WFNotificationActionBody"])))
        else:
            raise ValueError(f"Unexpected action {name}")
        if "UUID" in p:
            outputs[p["UUID"]] = last
    assert not frames
    return effects


def check(signed):
    actions = signed["WFWorkflowActions"]
    matches = [a for a in actions if a["WFWorkflowActionIdentifier"] == "is.workflow.actions.text.match"]
    assert len(matches) == 1
    pattern = matches[0]["WFWorkflowActionParameters"]["WFMatchTextPattern"]
    assert pattern == (IOS_DIR / "hyundai-nexon-message-pattern.txt").read_text(encoding="utf-8").strip()
    positive = [
        (SAMPLE, EXPECTED), (SAMPLE.replace("\n", " "), EXPECTED),
        (SAMPLE.replace("\n", "\r\n"), EXPECTED), (SAMPLE.replace("\n", "\r"), EXPECTED),
        (SAMPLE.replace("\n", "\u2028"), EXPECTED), (SAMPLE.replace("\n", "\u2029"), EXPECTED),
        (" \n" + SAMPLE + "\n\t", EXPECTED), (SAMPLE.replace("[Web발신]\n", ""), EXPECTED),
        (SAMPLE.replace("1,400원", "1원"), "1원 · 예시마트샘플점"),
        (SAMPLE.replace("1,400원", "123,456,789원"), "123,456,789원 · 예시마트샘플점"),
        (SAMPLE.replace("23,700원", "1원"), EXPECTED),
        (SAMPLE.replace("예시마트샘플점", "TEST SHOP 강남점"), "1,400원 · TEST SHOP 강남점"),
    ]
    negative = [
        "", " ", "인증번호 123456", "알림 내용이 숨겨져 있습니다", SAMPLE + "\n" + SAMPLE,
        SAMPLE + " " + SAMPLE.replace("1,400원", "5,000원"), SAMPLE + "\n인증번호 123456",
        SAMPLE.replace("넥슨 승인", "넥슨 승인거절"), SAMPLE.replace("넥슨 승인", "넥슨 승인취소"),
        SAMPLE.replace("현대 넥슨", "다른 카드"), SAMPLE.replace("일시불", "할부"),
        SAMPLE.replace("1,400원", "USD 1,400"), SAMPLE.replace("1,400원", "0원"),
        SAMPLE.replace("1,400원", "-1,400원"), SAMPLE.replace("1,400원", "1,40원"),
        SAMPLE.replace("1,400원 일시불\n", ""), SAMPLE.replace("예시마트샘플점\n", ""),
        SAMPLE.replace("예시마트샘플점", "인증번호 123456"), SAMPLE.replace("누적23,700원", ""),
    ]
    regex = IcuRegex(pattern)
    try:
        default = run_actions(actions, "", None, regex)
        assert default == [("prompt",), ("display", "현대카드 승인\n2,300원 · 테스트마트")], default
        for text, expected in positive:
            assert run_actions(actions, text, None, regex) == [("notify", "현대카드 승인", expected)]
            assert run_actions(actions, "", text, regex) == [("prompt",), ("display", "현대카드 승인\n" + expected)]
        for text in negative:
            effects = run_actions(actions, "", text, regex)
            assert len(effects) == 2 and effects[0] == ("prompt",) and "읽을 수 없습니다" in effects[1][1]
            if text:
                assert run_actions(actions, text, None, regex) == []
    finally:
        regex.close()
    print(f"PASS: {len(positive)} supported and {len(negative)} rejected messages; manual and incoming branches; built-in demo.")


if __name__ == "__main__":
    check(load_signed_workflow(next((IOS_DIR / "배포용").glob("*.shortcut"))))
