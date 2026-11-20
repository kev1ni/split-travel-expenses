"""
Flask 공통 처리: 응답 형식, 요청 파싱, 에러 핸들러, 파싱 앱 API 키 검사, 요청 로그.
"""

import hmac
import logging
import time
from functools import wraps
from typing import Any, Dict, Optional

from flask import Flask, g, jsonify, request
from werkzeug.exceptions import HTTPException

from config import settings
from core.errors import AppError, AuthError, ValidationError

logger = logging.getLogger("split_travel")


# ------------------------------------------------------------------
# 응답 / 요청
# ------------------------------------------------------------------
def success(status_code: int = 200, **payload):
    """{"status": "success", ...payload} 응답"""
    return jsonify({"status": "success", **payload}), status_code


def get_json_body() -> Dict[str, Any]:
    """요청 본문을 JSON 객체로 읽습니다. 비었거나 JSON 객체가 아니면 400."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ValidationError("요청 본문은 JSON 객체여야 합니다. (Content-Type: application/json)")
    return data


def query_int(name: str, default: Optional[int] = None, minimum: int = 0, maximum: int = 2**31 - 1) -> Optional[int]:
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ValidationError(f"쿼리 파라미터 {name}은(는) 정수여야 합니다.")
    if not (minimum <= value <= maximum):
        raise ValidationError(f"쿼리 파라미터 {name}은(는) {minimum}~{maximum} 사이여야 합니다.")
    return value


# ------------------------------------------------------------------
# 인증: 카드 파싱 앱 전용 API 키
# ------------------------------------------------------------------
def require_parser_key(view):
    """
    .env에 PARSER_API_KEY가 있으면 요청 헤더 X-API-Key가 같아야 통과 (401).
    PARSER_API_KEY가 비어 있으면 검사하지 않습니다 (개발용).
    """

    @wraps(view)
    def wrapper(*args, **kwargs):
        expected = settings.parser_api_key
        if expected:
            given = request.headers.get("X-API-Key", "")
            if not hmac.compare_digest(given.encode(), expected.encode()):
                raise AuthError("유효하지 않은 API 키입니다. (X-API-Key 헤더 확인)")
        return view(*args, **kwargs)

    return wrapper


# ------------------------------------------------------------------
# 에러 핸들러 & 요청 로그
# ------------------------------------------------------------------
def register_error_handlers(app: Flask) -> None:
    @app.errorhandler(AppError)
    def handle_app_error(e: AppError):
        if e.status_code >= 500:
            logger.exception("서버 오류: %s", e.message)
        return jsonify({"status": "error", "message": e.message}), e.status_code

    @app.errorhandler(HTTPException)
    def handle_http_error(e: HTTPException):
        messages = {
            404: f"존재하지 않는 API 경로입니다: {request.path} (API는 /api/로 시작합니다. 전체 목록은 / 에서 확인)",
            405: f"허용되지 않은 HTTP 메서드입니다: {request.method} {request.path}",
        }
        return jsonify({"status": "error", "message": messages.get(e.code, e.description)}), e.code

    @app.errorhandler(ValueError)
    def handle_value_error(e: ValueError):
        return jsonify({"status": "error", "message": str(e)}), 400

    @app.errorhandler(Exception)
    def handle_unexpected(e: Exception):
        logger.exception("처리되지 않은 오류")
        message = str(e) if settings.debug else "서버 내부 오류가 발생했습니다."
        return jsonify({"status": "error", "message": message}), 500


def register_request_logging(app: Flask) -> None:
    """요청마다 `POST /api/trips 201 (12ms)` 형태로 로그 → 연동 디버깅용"""

    @app.before_request
    def _start_timer():
        g._started = time.perf_counter()

    @app.after_request
    def _log(response):
        if request.path.startswith("/api/"):
            ms = (time.perf_counter() - g.get("_started", time.perf_counter())) * 1000
            logger.info("%s %s %s (%.0fms)", request.method, request.full_path.rstrip("?"), response.status_code, ms)
        return response
