"""
환경 설정 (.env) 한 곳에서 읽기.

다른 모듈은 os.environ을 직접 읽지 말고 `from config import settings`를 사용합니다.
"""

import base64
import hmac
import json
import os
import re
import secrets
from dataclasses import dataclass, field
from datetime import timedelta, timezone
from typing import List, Optional

from dotenv import load_dotenv

load_dotenv()

# Supabase 키 우선순위: 백엔드 전용 secret key → 레거시 service_role → publishable → 구버전 이름
SUPABASE_KEY_ENV_NAMES = (
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_KEY",
)


def _env(name: str, default: Optional[str] = None) -> Optional[str]:
    value = os.environ.get(name)
    if value is None or not value.strip():
        return default
    return value.strip()


def _is_server_key(value: str) -> bool:
    if value.startswith("sb_secret_"):
        return True
    # Legacy Supabase JWTs may be either public anon or server-only service_role.
    # Classify only operator-supplied configuration, never a request credential.
    try:
        _, payload, signature = value.split(".")
        claims = json.loads(base64.urlsafe_b64decode(payload + "==="))
        return bool(signature) and isinstance(claims, dict) and claims.get("role") == "service_role"
    except ValueError:
        return False


def session_signing_key():
    explicit = os.environ.get("NTRIP_SESSION_SECRET")
    if explicit:
        return explicit
    for name in ("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_KEY"):
        credential = _env(name)
        if credential and _is_server_key(credential):
            return hmac.digest(credential.encode(), b"ntrip:web-session-signing:v1", "sha256")
    if _env("VERCEL") or _env("SUPABASE_URL"):
        return None
    return secrets.token_hex(32)  # Isolated local development without a configured DB.


def _env_bool(name: str, default: bool = False) -> bool:
    value = _env(name)
    if value is None:
        return default
    return value.lower() in ("1", "true", "yes", "on")


def _parse_offset(raw: str) -> timezone:
    m = re.fullmatch(r"([+-])(\d{2}):?(\d{2})", raw.strip())
    if not m:
        return timezone(timedelta(hours=9))
    sign = 1 if m.group(1) == "+" else -1
    return timezone(sign * timedelta(hours=int(m.group(2)), minutes=int(m.group(3))))


@dataclass
class Settings:
    # Supabase
    supabase_url: Optional[str] = field(default_factory=lambda: _env("SUPABASE_URL"))
    supabase_key_name: Optional[str] = field(
        default_factory=lambda: next((n for n in SUPABASE_KEY_ENV_NAMES if _env(n)), None)
    )

    # 서버
    host: str = field(default_factory=lambda: _env("HOST", "0.0.0.0"))
    port: int = field(default_factory=lambda: int(_env("PORT", "5000")))
    debug: bool = field(default_factory=lambda: _env_bool("FLASK_DEBUG", False))
    cors_origins: List[str] = field(
        default_factory=lambda: [o.strip() for o in _env("CORS_ORIGINS", "*").split(",") if o.strip()]
    )

    # 시간대: 오프셋 없이 들어온 시각에 붙일 기본값 (한국 +09:00)
    default_utc_offset: str = field(default_factory=lambda: _env("DEFAULT_UTC_OFFSET", "+09:00"))

    # 카드 파싱 앱 → POST /api/card-events 호출 시 X-API-Key 헤더로 검사 (비우면 검사 안 함)
    parser_api_key: Optional[str] = field(default_factory=lambda: _env("PARSER_API_KEY"))
    collector_signing_key: Optional[str] = field(default_factory=lambda: _env("COLLECTOR_SIGNING_KEY"))

    @property
    def supabase_key(self) -> Optional[str]:
        return _env(self.supabase_key_name) if self.supabase_key_name else None

    @property
    def default_tz(self) -> timezone:
        return _parse_offset(self.default_utc_offset)


settings = Settings()
