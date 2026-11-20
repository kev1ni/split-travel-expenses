"""
코드 값 상수. DB(schema.sql의 CHECK 제약)와 동일하며 GET /api/meta로 프론트엔드에 제공됩니다.
"""

ENTRY_TYPES = ("manual", "auto_card", "correction", "cancellation")
SPLIT_TYPES = ("equal", "exact", "percentage")
SPLIT_TYPE_ALIASES = {"custom": "exact", "amount": "exact", "percent": "percentage", "ratio": "percentage"}
SETTLEMENT_STATUSES = ("pending", "completed")

# 자유 입력이지만 프론트엔드 드롭다운 기본값으로 제공
DEFAULT_CATEGORIES = ("식비", "교통", "숙박", "관광", "쇼핑", "기타")
DEFAULT_PAYMENT_METHODS = ("card", "cash")

PASSWORD_MIN_LENGTH = 8
SHARE_CODE_LENGTH = 6
BASIS_POINT_TOTAL = 10000  # 100.00%

UNKNOWN_NICKNAME = "알수없음"
