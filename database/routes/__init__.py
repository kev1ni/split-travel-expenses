"""
API 라우트 (Flask Blueprint). 도메인별 파일 하나 = Blueprint 하나.
"""

from flask import Flask

from routes.card_events import bp as card_events_bp
from routes.exchanges import bp as exchanges_bp
from routes.expenses import bp as expenses_bp
from routes.meta import bp as meta_bp
from routes.settlements import bp as settlements_bp
from routes.trips import bp as trips_bp
from routes.users import bp as users_bp
from routes.web import bp as web_bp

BLUEPRINTS = (meta_bp, users_bp, trips_bp, expenses_bp, settlements_bp, exchanges_bp, card_events_bp, web_bp)


def register_blueprints(app: Flask) -> None:
    for bp in BLUEPRINTS:
        app.register_blueprint(bp, url_prefix="/api")
