"""
입력값 검증·변환 공통 함수.

모든 함수는 잘못된 값이면 ValidationError(400)를 발생시킵니다.
"""

import re
from datetime import date, datetime
from decimal import ROUND_FLOOR, ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any, Dict, Iterable, Optional

from config import settings
from core.errors import AppError, DatabaseError, ValidationError

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
CURRENCY_RE = re.compile(r"^[A-Z]{3}$")


def now_iso() -> str:
    """현재 시각 (기본 시간대, ISO 8601)"""
    return datetime.now(settings.default_tz).isoformat()


def text(value: Any, field: str, required: bool = False, max_len: Optional[int] = None) -> Optional[str]:
    if value is None or not str(value).strip():
        if required:
            raise ValidationError(f"{field}은(는) 필수 항목입니다.")
        return None
    result = str(value).strip()
    if max_len and len(result) > max_len:
        raise ValidationError(f"{field}은(는) 최대 {max_len}자까지 입력할 수 있습니다.")
    return result


def _parse_decimal(value: Any, field: str, kind: str) -> Decimal:
    if isinstance(value, bool):
        raise ValidationError(f"{field}은(는) {kind}여야 합니다.")
    try:
        d = Decimal(str(value).replace(",", "").strip())
    except InvalidOperation:
        raise ValidationError(f"{field}은(는) {kind}여야 합니다: {value}")
    if not d.is_finite():
        raise ValidationError(f"{field}은(는) {kind}여야 합니다: {value}")
    return d


def _is_blank(value: Any) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def to_int(value: Any, field: str, required: bool = True, minimum: Optional[int] = None) -> Optional[int]:
    if _is_blank(value):
        if required:
            raise ValidationError(f"{field}은(는) 필수 항목입니다.")
        return None
    d = _parse_decimal(value, field, "정수")
    if d != d.to_integral_value():
        raise ValidationError(f"{field}은(는) 정수여야 합니다: {value}")
    result = int(d)
    if minimum is not None and result < minimum:
        raise ValidationError(f"{field}은(는) {minimum} 이상이어야 합니다.")
    return result


def to_decimal(value: Any, field: str, required: bool = True, positive: bool = False) -> Optional[Decimal]:
    if _is_blank(value):
        if required:
            raise ValidationError(f"{field}은(는) 필수 항목입니다.")
        return None
    d = _parse_decimal(value, field, "숫자")
    if positive and d <= 0:
        raise ValidationError(f"{field}은(는) 0보다 커야 합니다.")
    return d


def numeric_out(d: Optional[Decimal]):
    """Decimal → DB 전송값. 정수면 int, 소수면 문자열 (INTEGER/NUMERIC 컬럼 모두 호환)"""
    if d is None:
        return None
    if d == d.to_integral_value():
        return int(d)
    return format(d.normalize(), "f")


def decimal_text(d: Optional[Decimal]) -> Optional[str]:
    return None if d is None else format(d.normalize(), "f")


def round_krw(d: Decimal) -> int:
    return int(d.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def floor_int(d: Decimal) -> int:
    return int(d.to_integral_value(rounding=ROUND_FLOOR))


def currency(value: Any, field: str = "currency", default: Optional[str] = None) -> str:
    if _is_blank(value):
        if default:
            return default
        raise ValidationError(f"{field}은(는) 필수 항목입니다.")
    cur = str(value).strip().upper()
    if not CURRENCY_RE.match(cur):
        raise ValidationError(f"{field}은(는) 3자리 영문 통화 코드여야 합니다 (예: KRW, JPY, USD).")
    return cur


def to_date(value: Any, field: str, required: bool = False) -> Optional[str]:
    if _is_blank(value):
        if required:
            raise ValidationError(f"{field}은(는) 필수 항목입니다.")
        return None
    try:
        return date.fromisoformat(str(value).strip()[:10]).isoformat()
    except ValueError:
        raise ValidationError(f"{field}은(는) YYYY-MM-DD 형식이어야 합니다: {value}")


def to_datetime(value: Any, field: str, required: bool = False) -> Optional[str]:
    """ISO 8601 시각 검증. 시간대가 없으면 기본 오프셋(+09:00)을 붙입니다."""
    if _is_blank(value):
        if required:
            raise ValidationError(f"{field}은(는) 필수 항목입니다.")
        return None
    raw = str(value).strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError:
        raise ValidationError(
            f"{field}은(는) ISO 8601 형식이어야 합니다 (예: 2026-11-25T12:30:00+09:00): {value}"
        )
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=settings.default_tz)
    return dt.isoformat()


def local_date(value: Any) -> str:
    """DB의 timestamptz(UTC)를 기본 시간대 날짜(YYYY-MM-DD)로 변환"""
    raw = str(value)
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return raw[:10]
    if dt.tzinfo is not None:
        dt = dt.astimezone(settings.default_tz)
    return dt.date().isoformat()


def choice(value: Any, field: str, allowed: Iterable[str], default: str, aliases: Dict[str, str] = None) -> str:
    if _is_blank(value):
        return default
    v = str(value).strip().lower()
    if aliases:
        v = aliases.get(v, v)
    if v not in allowed:
        raise ValidationError(f"{field} 값이 올바르지 않습니다: {value} (허용: {', '.join(sorted(allowed))})")
    return v


def email(value: Any, field: str = "email") -> str:
    result = text(value, field, required=True, max_len=100).lower()
    if not EMAIL_RE.match(result):
        raise ValidationError(f"이메일 형식이 올바르지 않습니다: {result}")
    return result


def first(res) -> Optional[Dict[str, Any]]:
    """Supabase 응답에서 첫 번째 행 (없으면 None)"""
    return res.data[0] if res is not None and res.data else None


def to_number(value):
    """NUMERIC 컬럼(문자열/숫자)을 int 또는 float로"""
    if value is None or value == "":
        return 0
    d = Decimal(str(value))
    return int(d) if d == d.to_integral_value() else float(d)


def db_call(action: str, fn):
    """DB 호출을 감싸 예기치 못한 오류를 DatabaseError(500)로 변환"""
    try:
        return fn()
    except AppError:
        raise
    except Exception as e:  # noqa: BLE001
        raise DatabaseError(f"{action} 중 데이터베이스 오류: {e}") from e
