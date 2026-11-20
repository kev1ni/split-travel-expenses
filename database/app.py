"""
Split Travel 백엔드 서버 진입점.

    python app.py                 # 개발/운영 모두 이 명령 하나로 실행
    FLASK_DEBUG=true python app.py  # 코드 수정 시 자동 재시작 + 상세 오류

waitress가 설치돼 있고 디버그 모드가 아니면 waitress(운영용 WSGI 서버)로,
아니면 Flask 개발 서버로 실행합니다.
"""

import logging

from flask import Flask
from flask_cors import CORS

from config import settings
from core.http import register_error_handlers, register_request_logging
from routes import register_blueprints

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("split_travel")


def create_app() -> Flask:
    app = Flask(__name__)
    app.json.ensure_ascii = False  # 한글을 \uXXXX 대신 그대로
    app.json.sort_keys = False

    origins = settings.cors_origins
    CORS(
        app,
        resources={r"/api/*": {"origins": "*" if origins in ([], ["*"]) else origins}},
        allow_headers=["Content-Type", "X-API-Key"],
        methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    )

    register_error_handlers(app)
    register_request_logging(app)
    register_blueprints(app)

    @app.get("/")
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
    logger.info("같은 와이파이에서 : http://%s:%s/api/health  (휴대폰 파싱 앱은 이 주소 사용)", lan_ip, settings.port)
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
