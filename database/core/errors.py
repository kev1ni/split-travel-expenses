"""
API 공통 예외 클래스.

각 예외는 HTTP 상태 코드를 가지고 있으며, app.py의 errorhandler가
{"status": "error", "message": ...} 형태의 JSON 응답으로 변환합니다.

ValidationError는 기존 코드와의 호환을 위해 ValueError를 상속합니다.
"""


class AppError(Exception):
    """모든 비즈니스 예외의 기본 클래스"""

    status_code = 400

    def __init__(self, message: str, status_code: int = None):
        super().__init__(message)
        self.message = message
        if status_code is not None:
            self.status_code = status_code


class ValidationError(AppError, ValueError):
    """요청 값이 잘못된 경우 (400 Bad Request)"""

    status_code = 400


class AuthError(AppError):
    """인증 실패 (401 Unauthorized)"""

    status_code = 401


class NotFoundError(AppError):
    """대상 리소스가 없는 경우 (404 Not Found)"""

    status_code = 404


class ConflictError(AppError):
    """중복/상태 충돌 (409 Conflict)"""

    status_code = 409


class DatabaseError(AppError):
    """Supabase(DB) 처리 중 예기치 못한 오류 (500 Internal Server Error)"""

    status_code = 500
