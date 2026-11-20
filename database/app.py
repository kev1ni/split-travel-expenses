"""
Split Travel 백엔드 서버 진입점.

    python app.py                 # 개발/운영 모두 이 명령 하나로 실행
    FLASK_DEBUG=true python app.py  # 코드 수정 시 자동 재시작 + 상세 오류

waitress가 설치돼 있고 디버그 모드가 아니면 waitress(운영용 WSGI 서버)로,
아니면 Flask 개발 서버로 실행합니다.
"""

import hmac
import logging
import os
from pathlib import Path
import secrets

from flask import Flask, abort, request, send_from_directory
from flask_cors import CORS

from config import settings
from core.http import register_error_handlers, register_request_logging
from routes import register_blueprints
from routes.v1_finance import bp as finance_bp

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("split_travel")


def create_app(*, legacy_test=False) -> Flask:
    app = Flask(__name__)
    app.secret_key = os.environ.get("NTRIP_SESSION_SECRET") or secrets.token_hex(32)
    app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax",
                      SESSION_COOKIE_SECURE=os.environ.get("SESSION_COOKIE_SECURE", "").lower() == "true",
                      MAX_CONTENT_LENGTH=128 * 1024)
    app.json.ensure_ascii = False  # 한글을 \uXXXX 대신 그대로
    app.json.sort_keys = False

    origins = settings.cors_origins
    CORS(
        app,
        resources={r"/api/*": {"origins": "*" if origins in ([], ["*"]) else origins}},
        allow_headers=["Content-Type", "Authorization", "X-API-Key"],
        supports_credentials=origins not in ([], ["*"]),
        methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    )

    register_error_handlers(app)
    register_request_logging(app)
    register_blueprints(app)
    app.register_blueprint(finance_bp, url_prefix="/api/v1")

    @app.before_request
    def gate_legacy():
        path = request.path
        if not path.startswith("/api/") or request.method == "OPTIONS":
            return
        origin = request.headers.get("Origin")
        if (origin and request.method not in ("GET", "HEAD") and
                origin != request.host_url.rstrip("/") and origin not in origins):
            abort(403, description="허용된 웹 주소에서 다시 요청해주세요.")
        if (legacy_test or path.startswith(("/api/v1/", "/api/collector/")) or
                path in ("/api/health", "/api/meta") or
                (path == "/api/card-events/unassigned" and request.args.get("scoped") == "true")):
            return
        # The original DB-team routes take caller-supplied IDs and have no user sessions.
        # Only server-to-server callers may use those routes directly.
        configured = os.environ.get("NTRIP_LEGACY_API_KEY", "")
        if not configured or not hmac.compare_digest(configured.encode(), request.headers.get("X-Legacy-Key", "").encode()):
            abort(403)

    @app.get("/api")
    def index():
        """서버 주소만 열었을 때 보여줄 안내 (API는 모두 /api/ 아래에 있음)"""
        endpoints = sorted(
            f"{','.join(sorted(r.methods - {'HEAD', 'OPTIONS'}))} {r.rule}"
            for r in app.url_map.iter_rules()
            if r.rule.startswith("/api/")
        )
        return {
            "service": "split_travel_backend",
            "message": "서버가 정상 실행 중입니다. API는 모두 /api/ 로 시작합니다.",
            "health_check": "/api/health?db=true",
            "docs": "docs/API_DOCUMENTATION.md, docs/INTEGRATION_GUIDE.md",
            "endpoints": endpoints,
        }

    dist = Path(__file__).resolve().parents[1] / "frontend" / "dist"

    @app.get("/")
    @app.get("/<path:path>")
    def frontend(path=""):
        if path == "api" or path.startswith("api/"):
            abort(404)
        if not (dist / "index.html").is_file():
            if not path:
                return index()
            abort(404)
        if path.startswith("assets/") or "." in path.rsplit("/", 1)[-1]:
            return send_from_directory(dist, path)
        return send_from_directory(dist, "index.html")

    return app


app = create_app()


def _print_banner() -> None:
    import socket

    try:
        lan_ip = socket.gethostbyname(socket.gethostname())
    except OSError:
        lan_ip = "내 PC IP"
    logger.info("=== Split Travel 백엔드 서버 ===")
    logger.info("이 PC에서        : http://localhost:%s/api/health", settings.port)
    logger.info("같은 와이파이에서 : http://%s:%s/api/health  (웹 개발용, 휴대폰 수집은 HTTPS 주소 사용)", lan_ip, settings.port)
    logger.info("Supabase 키      : %s", settings.supabase_key_name or "설정 안 됨 (.env 확인)")
    logger.info("파싱 앱 API 키    : %s", "사용" if settings.parser_api_key else "사용 안 함 (PARSER_API_KEY 비어 있음)")


if __name__ == "__main__":
    _print_banner()
    if not settings.debug:
        try:
            from waitress import serve

            logger.info("waitress 서버로 실행 (debug=False)")
            serve(app, host=settings.host, port=settings.port)
            raise SystemExit(0)
        except ImportError:
            logger.info("waitress 미설치 → Flask 개발 서버로 실행")
    app.run(host=settings.host, port=settings.port, debug=settings.debug)
