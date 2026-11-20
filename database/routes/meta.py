"""서버 상태 / 프론트엔드용 코드 값"""

from flask import Blueprint, jsonify, request

from core import constants
from core.db import TABLE_TRIPS, get_supabase_client, key_source
from core.http import logger, success

bp = Blueprint("meta", __name__)


@bp.get("/health")
def health():
    """서버 상태. ?db=true 면 Supabase 연결까지 확인 (실패 시 503)"""
    result = {"status": "healthy", "service": "split_travel_backend", "supabase_key": key_source()}
    if request.args.get("db") in ("1", "true"):
        try:
            get_supabase_client().table(TABLE_TRIPS).select("id").limit(1).execute()
            result["database"] = "connected"
        except Exception as e:  # noqa: BLE001
            logger.warning("DB 헬스체크 실패: %s", e)
            result.update(status="degraded", database="unreachable")
            return jsonify(result), 503
    return jsonify(result), 200


@bp.get("/meta")
def meta():
    """드롭다운·검증에 쓰는 코드 값 목록"""
    return success(meta={
        "entry_types": list(constants.ENTRY_TYPES),
        "split_types": list(constants.SPLIT_TYPES),
        "settlement_statuses": list(constants.SETTLEMENT_STATUSES),
        "categories": list(constants.DEFAULT_CATEGORIES),
        "payment_methods": list(constants.DEFAULT_PAYMENT_METHODS),
        "password_min_length": constants.PASSWORD_MIN_LENGTH,
        "basis_point_total": constants.BASIS_POINT_TOTAL,
    })
