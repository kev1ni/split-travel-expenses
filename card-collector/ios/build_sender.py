"""Build the sender invoked by a card app's iOS 27 Notification automation."""

import json
import plistlib
import re
import uuid
from pathlib import Path

IOS = Path(__file__).resolve().parent
NAME = "NTrip 카드 앱 푸시 전송"
SOURCE = IOS / "source" / (NAME + ".shortcut")
ENDPOINT = r"\Ahttps://[A-Za-z0-9.-]+(?::[0-9]{1,5})?/api/collector/events\z"
UUID4 = r"[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-4[a-fA-F0-9]{3}-8[a-fA-F0-9]{3}-[a-fA-F0-9]{12}"
ISSUER = r"[가-힣A-Za-z0-9][가-힣A-Za-z0-9 .&'-]{0,49}"
SHOP = r"[가-힣A-Za-z0-9][가-힣A-Za-z0-9 .&()'-]{0,63}"
INTEGER = r"(?:[1-9][0-9]{0,2}(?:,[0-9]{3}){1,3}|[1-9][0-9]{0,11})"
MONEY = rf"(?:{INTEGER}(?:\.[0-9]{{1,2}})?|0\.(?:[1-9][0-9]?|0[1-9]))"
CURRENCY = r"(?:USD|EUR|JPY|KRW)"
KIND = r"(?:해외|국내)?(승인취소|취소|승인)"
AMOUNT_LABEL = r"(?:결제금액[ \t]*[:：][ \t]*)?"
WON = rf"\A({KIND}\s+){AMOUNT_LABEL}({INTEGER})원(\s+가맹점[\s\S]+)\z"
PAYMENT = (rf"\A{KIND}\s+{AMOUNT_LABEL}({CURRENCY})[ \t]+({MONEY})"
           rf"\s+가맹점(?:명)?[ \t]*[:：][ \t]*({SHOP}?)"
           r"(?:\s+승인번호[ \t]*[:：][ \t]*([0-9]{6,12}))?\s*\z")
TEMPLATE = {
    "event_id": "@ID@", "source": "app_push", "message_format": None,
    "issuer": "@ISSUER@", "event_type": "@TYPE@", "amount": "@AMOUNT@", "currency": "@CURRENCY@",
    "merchant": "@SHOP@", "approval_ref": "@REF@", "occurred_at": None, "received_at": "@TIME@",
}
BODY = json.dumps(TEMPLATE, ensure_ascii=False, separators=(",", ":")).replace('"@REF@"', "@REF@")
FIELDS = {
    "@ID@": UUID4, "@TYPE@": "(?:approval|cancel)", "@CURRENCY@": CURRENCY,
    "@ISSUER@": ISSUER, "@AMOUNT@": r"(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,2})?",
    "@SHOP@": SHOP, "@REF@": r'(?:"[0-9]{6,12}"|null)',
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
    issuer = setup("자동화에서 선택할 카드사 앱의 카드사 이름을 입력하세요.")
    require(match(url, ENDPOINT), "설정에서 HTTPS 수신 주소를 확인해 주세요.")
    require(match(token, r"\A[A-Za-z0-9_.-]{16,2048}\z"), "설정에서 발급받은 토큰 값을 확인해 주세요.")
    require(match(issuer, r"\A" + ISSUER + r"\z"), "설정에서 카드사 이름을 확인해 주세요.")
    binding = action("hash", WFInput=action("gettext", WFTextActionText=token_text(url, "\n", token, "\n", issuer)), WFHashType="SHA256")

    incoming = {"WFSerializationType": "WFTextTokenAttachment", "Value": {"Type": "ExtensionInput"}}
    require(incoming)
    content = action("detect.text", WFInput=incoming)

    # A retry uses an exact, account-bound copy of the original JSON. No token is stored in the file.
    body_pattern = re.escape(BODY)
    for marker, pattern in FIELDS.items():
        body_pattern = body_pattern.replace(marker, pattern)
    retry = match(content, token_text(r"\ANTRIPPUSH1 ", binding, r"\r?\n(", body_pattern, r")\s*\z"))
    mode = begin(retry)
    group(retry, 1)
    end(mode, 1)
    won = begin(match(content, WON))
    replace(content, WON, "$1KRW $3$4", True)
    end(won, 1)
    action("gettext", WFTextActionText=token_text(content))
    normalized = end(won)
    payment = match(normalized, PAYMENT)
    require(payment)
    kind, currency, raw_amount, shop = (group(payment, i) for i in range(1, 5))
    amount = replace(raw_amount, ",", "")
    integral = begin(match(currency, r"\A(?:KRW|JPY)\z"))
    require(match(amount, r"\A[1-9][0-9]{0,11}\z"))
    end(integral)
    approved = begin(match(kind, r"\A승인\z"))
    action("gettext", WFTextActionText="approval")
    end(approved, 1)
    action("gettext", WFTextActionText="cancel")
    event_type = end(approved)
    has_ref = begin(match(content, r"승인번호[ \t]*[:：][ \t]*[0-9]{6,12}\s*\z"))
    action("gettext", WFTextActionText=token_text('"', group(payment, 5), '"'))
    end(has_ref, 1)
    action("gettext", WFTextActionText="null")
    ref_json = end(has_ref)

    now = action("date", WFDateActionMode="Current Date")
    stamp = action("format.date", WFDate=token_text(now), WFDateFormatStyle="ISO 8601", WFISO8601IncludeTime=True)
    randoms = [action("number.random", WFRandomNumberMinimum=0, WFRandomNumberMaximum=1073741823) for _ in range(4)]
    seed = action("gettext", WFTextActionText=token_text(*[v for item in randoms for v in (item, "|")], stamp))
    digest = action("hash", WFInput=seed, WFHashType="SHA256")
    event_id = replace(digest, r"(?i)\A(.{8})(.{4}).(.{3}).(.{3})(.{12}).*\z", "$1-$2-4$3-8$4-$5", True)
    values = {"@ID@": event_id, "@ISSUER@": issuer, "@TYPE@": event_type, "@CURRENCY@": currency,
              "@AMOUNT@": amount, "@SHOP@": shop, "@REF@": ref_json, "@TIME@": stamp}
    parts = re.split(r"(@[A-Z]+@)", BODY)
    json_body = action("gettext", WFTextActionText=token_text(*[values.get(p, p) for p in parts]))
    require(match(json_body, r"\A" + body_pattern + r"\z"), "결제 내역의 형식을 확인할 수 없어 전송을 중단했어요.")
    queue_item = action("gettext", WFTextActionText=token_text("NTRIPPUSH1 ", binding, "\n", json_body))
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
    require(match(ack, token_text(r"(?i)\A", identifier, r"\z")), "저장 확인 전이에요. 대기 파일로 다시 보낼 수 있어요.")
    action("notification", WFNotificationActionTitle=NAME, WFNotificationActionBody="서버가 카드 알림을 수신했어요.")
    return {"WFWorkflowName": NAME, "WFWorkflowTypes": [], "WFWorkflowHasShortcutInputVariables": True,
            "WFWorkflowMinimumClientVersion": 900, "WFWorkflowMinimumClientVersionString": "900",
            "WFWorkflowClientVersion": "3030.0.4",
            "WFWorkflowIcon": {"WFWorkflowIconGlyphNumber": 61440, "WFWorkflowIconStartColor": 4282601983},
            "WFWorkflowInputContentItemClasses": ["WFStringContentItem", "WFGenericFileContentItem"],
            "WFWorkflowImportQuestions": questions, "WFWorkflowActions": actions}


if __name__ == "__main__":
    SOURCE.parent.mkdir(exist_ok=True)
    SOURCE.write_bytes(plistlib.dumps(make_workflow(), fmt=plistlib.FMT_BINARY, sort_keys=False))
    print(SOURCE.name)
