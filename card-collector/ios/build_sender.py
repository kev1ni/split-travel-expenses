"""Build the Hyundai message → NTrip server workflow. Import questions are filled on the phone."""

import json
import plistlib
import re
import uuid
from pathlib import Path

IOS = Path(__file__).resolve().parent
NAME = "NTrip 현대카드 전송"
ENDPOINT = r"\Ahttps://[A-Za-z0-9.-]+(?::[0-9]{1,5})?/api/collector/events\z"
UUID4 = r"[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-4[a-fA-F0-9]{3}-8[a-fA-F0-9]{3}-[a-fA-F0-9]{12}"
TEMPLATE = {
    "event_id": "@ID@", "source": "message", "message_format": None,
    "issuer": "현대카드", "event_type": "approval", "amount": "@AMOUNT@", "currency": "KRW",
    "merchant": "@SHOP@", "approval_ref": None, "occurred_at": None, "received_at": "@TIME@",
}
BODY = json.dumps(TEMPLATE, ensure_ascii=False, separators=(",", ":"))
FIELDS = {
    "@ID@": UUID4, "@AMOUNT@": "[1-9][0-9]{0,11}", "@SHOP@": "[가-힣A-Za-z0-9 \u00a0.&()'-]{1,64}",
    "@TIME@": r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:[.][0-9]+)?(?:Z|[+-][0-9]{2}:[0-9]{2})",
}


def token_text(*parts):
    value = ""
    attachments = {}
    for part in parts:
        if isinstance(part, str):
            value += part
        else:
            pos = len(value.encode("utf-16le")) // 2
            attachments[f"{{{pos}, 1}}"] = part["Value"]
            value += "\ufffc"
    return {"WFSerializationType": "WFTextTokenString",
            "Value": {"string": value, "attachmentsByRange": attachments}}


def headers(token):
    items = []
    for key, value in [("Authorization", token_text("Bearer ", token)), ("Content-Type", token_text("application/json"))]:
        items.append({"WFItemType": 0, "WFKey": token_text(key), "WFValue": value})
    return {"WFSerializationType": "WFDictionaryFieldValue", "Value": {"WFDictionaryFieldValueItems": items}}


def make_workflow():
    preview = plistlib.loads((IOS / "현대카드 승인 확인.shortcut").read_bytes())
    actions, questions = [], []

    def action(name, **params):
        uid = str(uuid.uuid5(uuid.NAMESPACE_URL, f"ntrip:sender:{len(actions)}:{name}")).upper()
        params["UUID"] = uid
        actions.append({"WFWorkflowActionIdentifier": "is.workflow.actions." + name,
                        "WFWorkflowActionParameters": params})
        return {"WFSerializationType": "WFTextTokenAttachment", "Value": {"Type": "ActionOutput", "OutputUUID": uid}}

    def setup(question):
        questions.append({"Category": "Parameter", "ActionIndex": len(actions), "ParameterKey": "WFTextActionText",
                          "Text": question, "DefaultValue": ""})
        return action("gettext", WFTextActionText="")

    def match(value, pattern):
        return action("text.match", text=value, WFMatchTextPattern=pattern, WFMatchTextCaseSensitive=True)

    def group(matches, index):
        return action("text.match.getgroup", matches=matches, WFGetGroupType="Group At Index", WFGroupIndex=index)

    def replace(value, search, replacement, regex=False):
        return action("text.replace", WFInput=value, WFReplaceTextFind=search, WFReplaceTextReplace=replacement,
                      WFReplaceTextRegularExpression=regex)

    def begin(value, condition=100):
        key = str(uuid.uuid5(uuid.NAMESPACE_URL, f"ntrip:group:{len(actions)}")).upper()
        action("conditional", GroupingIdentifier=key, WFControlFlowMode=0, WFCondition=condition,
               WFInput={"Type": "Variable", "Variable": value})
        return key

    def end(key, mode=2):
        return action("conditional", GroupingIdentifier=key, WFControlFlowMode=mode)

    def require(value, message=None):
        key = begin(value, 101)
        if message:
            action("notification", WFNotificationActionTitle=NAME, WFNotificationActionBody=message)
        action("exit")
        end(key)

    url = setup("여행 웹의 ‘휴대폰 수집기 연결’에서 받은 전체 HTTPS 서버 주소를 입력하세요.")
    token = setup("같은 화면에서 발급한 이 결제자의 Bearer 토큰 값만 입력하세요.")
    require(match(url, ENDPOINT), "설정에서 HTTPS 수신 주소를 확인해 주세요.")
    require(match(token, r"\A[A-Za-z0-9_.-]{16,2048}\z"), "설정에서 발급받은 토큰 값을 확인해 주세요.")
    binding = action("hash", WFInput=action("gettext", WFTextActionText=token_text(url, "\n", token)), WFHashType="SHA256")

    incoming = {"WFSerializationType": "WFTextTokenAttachment", "Value": {"Type": "ExtensionInput"}}
    key = begin(incoming)
    action("detect.text", WFInput=incoming)
    end(key, 1)
    action("ask", WFAskActionPrompt="현대 넥슨 승인 문자 또는 재전송 파일의 내용을 입력하세요.",
           WFInputType="Text", WFAllowsMultilineText=True)
    content = end(key)

    # A retry uses an exact, account-bound copy of the original JSON. No token is stored in the file.
    body_pattern = re.escape(BODY)
    for marker, pattern in FIELDS.items():
        body_pattern = body_pattern.replace(marker, pattern)
    retry = match(content, token_text(r"\ANTRIP1 ", binding, r"\r?\n(", body_pattern, r")\s*\z"))
    mode = begin(retry)
    group(retry, 1)
    end(mode, 1)
    payment = match(content, (IOS / "hyundai-nexon-message-pattern.txt").read_text("utf-8").strip())
    require(payment)
    amount = replace(group(payment, 1), ",", "")
    shop = replace(group(payment, 2), "\t", " ")

    now = action("date", WFDateActionMode="Current Date")
    stamp = action("format.date", WFDate=token_text(now), WFDateFormatStyle="ISO 8601", WFISO8601IncludeTime=True)
    randoms = [action("number.random", WFRandomNumberMinimum=0, WFRandomNumberMaximum=1073741823) for _ in range(4)]
    seed = action("gettext", WFTextActionText=token_text(*[v for item in randoms for v in (item, "|")], stamp))
    digest = action("hash", WFInput=seed, WFHashType="SHA256")
    event_id = replace(digest, r"(?i)\A(.{8})(.{4}).(.{3}).(.{3})(.{12}).*\z", "$1-$2-4$3-8$4-$5", True)
    values = {"@ID@": event_id, "@AMOUNT@": amount, "@SHOP@": shop, "@TIME@": stamp}
    parts = re.split(r"(@[A-Z]+@)", BODY)
    json_body = action("gettext", WFTextActionText=token_text(*[values.get(p, p) for p in parts]))
    require(match(json_body, r"\A" + body_pattern + r"\z"), "결제 내역의 형식을 확인할 수 없어 전송을 중단했어요.")
    queue_item = action("gettext", WFTextActionText=token_text("NTRIP1 ", binding, "\n", json_body))
    action("documentpicker.save", WFInput=queue_item, WFAskWhereToSave=False, WFSaveFileOverwrite=False,
           WFFolder={"displayName": "Shortcuts", "fileLocation": {"WFFileLocationType": "Shortcuts",
                     "relativeSubpath": ""}, "filename": "Documents"},
           WFFileDestinationPath=token_text("NTrip-", event_id, ".txt"))
    action("gettext", WFTextActionText=token_text(json_body))
    body = end(mode)

    identifier = group(match(body, r'\A\{"event_id":"(' + UUID4 + r')",'), 1)
    response = action("downloadurl", WFURL=token_text(url), WFHTTPMethod="POST", WFHTTPBodyType="File",
                      WFHTTPHeaders=headers(token), WFRequestVariable=body)
    saved = action("getvalueforkey", WFInput=response, WFDictionaryKey="card_event", WFGetDictionaryValueType="Value")
    ack = action("getvalueforkey", WFInput=saved, WFDictionaryKey="event_id", WFGetDictionaryValueType="Value")
    require(match(ack, token_text(r"\A", identifier, r"\z")), "저장 확인 전이에요. 대기 파일로 다시 보낼 수 있어요.")
    action("notification", WFNotificationActionTitle="NTrip 카드 알림", WFNotificationActionBody="여행의 카드 알림에 저장했어요.")
    return {**preview, "WFWorkflowName": NAME, "WFWorkflowTypes": ["ActionExtension"],
            "WFWorkflowInputContentItemClasses": ["WFStringContentItem", "WFGenericFileContentItem"],
            "WFWorkflowImportQuestions": questions, "WFWorkflowActions": actions}


if __name__ == "__main__":
    path = IOS / (NAME + ".shortcut")
    path.write_bytes(plistlib.dumps(make_workflow(), fmt=plistlib.FMT_BINARY, sort_keys=False))
    print(path.name)
