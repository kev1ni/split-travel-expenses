"""Daily reference rate, expressed as units of the quote currency per base unit."""

from datetime import date
from decimal import Decimal, InvalidOperation
import json
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

from core.errors import AppError, ValidationError
from core.validators import currency, to_number


def lookup(base, quote, day=None):
    base, quote = currency(base, "base"), currency(quote, "quote", default="KRW")
    try:
        day = date.fromisoformat(day).isoformat() if day else None
    except ValueError as exc:
        raise ValidationError("date는 YYYY-MM-DD 형식이어야 합니다.") from exc
    if base == quote:
        return dict(base=base, quote=quote, rate=1, rate_date=day or date.today().isoformat(),
                    source="identity", is_estimated=False)
    if day and day > date.today().isoformat():
        raise ValidationError("미래 날짜의 기준 환율은 없습니다. 환율을 직접 입력해 주세요.")
    url = f"https://api.frankfurter.dev/v2/rate/{base}/{quote}"
    if day:
        url += f"?date={day}"
    try:
        with urlopen(url, timeout=4) as response:
            data = json.load(response, parse_float=Decimal)
        rate = Decimal(str(data["rate"]))
        published = date.fromisoformat(data["date"]).isoformat()
        if not rate.is_finite() or rate <= 0 or data["base"] != base or data["quote"] != quote:
            raise ValueError("invalid reference rate")
    except HTTPError as exc:
        if exc.code in (400, 404, 422):
            raise ValidationError("해당 통화·날짜의 기준 환율이 없습니다. 환율을 직접 입력해 주세요.") from exc
        raise AppError("기준 환율 제공처에 연결할 수 없습니다. 환율을 직접 입력해 주세요.", 503) from exc
    except (OSError, URLError, KeyError, ValueError, TypeError, InvalidOperation) as exc:
        raise AppError("기준 환율을 확인할 수 없습니다. 환율을 직접 입력해 주세요.", 503) from exc
    return dict(base=base, quote=quote, rate=to_number(rate), rate_date=published,
                source="Frankfurter", is_estimated=True)
