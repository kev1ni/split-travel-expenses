"""회원: 회원가입 / 로그인 / 내 여행 목록"""

from flask import Blueprint

from core.http import get_json_body, success
from services import users

bp = Blueprint("users", __name__)


@bp.post("/register")
def register():
    return success(201, user=users.register_user(get_json_body()))


@bp.post("/login")
def login():
    return success(200, message="로그인에 성공했습니다.", user=users.login_user(get_json_body()))


@bp.get("/users/<int:user_id>/trips")
def user_trips(user_id: int):
    return success(trips=users.get_user_trips(user_id))
