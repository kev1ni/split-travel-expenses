"""Session, guest invitation and trip-management contracts for the live browser."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fake_supabase import FakeClient

from app import create_app
from core.db import set_supabase_client


def test_v1_accounts_guests_and_trip_membership():
    db = FakeClient()
    set_supabase_client(db)
    app = create_app()
    owner, guest, stranger, mobile = (app.test_client() for _ in range(4))
    url = "/api/v1"

    def call(client, method, path, status, **options):
        res = client.open(url + path, method=method, **options)
        assert res.status_code == status, (path, res.get_json())
        return res.get_json().get("data")

    signup = {"login_id": "owner", "password": "sample-password", "nickname": "방장"}
    call(owner, "POST", "/auth/signup", 201, json=signup)
    login = call(owner, "POST", "/auth/login", 200, json=signup)
    assert "password_hash" not in login["user"]
    bearer = {"Authorization": "Bearer " + login["access_token"]}
    assert call(mobile, "GET", "/auth/me", 200, headers=bearer)["login_id"] == "owner"
    trip = call(owner, "POST", "/trips", 201, json={"title": "서울", "created_by": 999})
    group = "/trips/" + str(trip["id"])
    assert trip["created_by"] == login["user"]["id"]
    call(mobile, "PATCH", group, 200, headers=bearer, json={"title": "서울 여행"})
    invite = call(owner, "POST", group + "/invitations", 200)
    assert invite["invite_path"] == "/invite/" + trip["share_code"]
    joined = call(guest, "POST", "/invitations/accept", 201, json={"share_code": trip["share_code"], "nickname": "친구"})
    assert call(guest, "GET", "/auth/me", 200)["is_guest"]
    assert len(call(guest, "GET", "/trips", 200)) == 1
    assert len(call(guest, "GET", group + "/members", 200)) == 2
    assert call(guest, "POST", "/invitations/accept", 200, json={"share_code": trip["share_code"]})["member_id"] == joined["member_id"]
    call(guest, "DELETE", group, 403)
    call(stranger, "GET", group, 401)
    call(owner, "DELETE", group + "/members/" + str(trip["my_member_id"]), 409)
    call(owner, "DELETE", group + "/members/" + str(joined["member_id"]), 200)
    call(guest, "GET", group, 403)
    call(owner, "DELETE", group, 200)
    call(mobile, "POST", "/auth/logout", 200, headers=bearer)
    call(owner, "GET", "/auth/me", 401)
    call(mobile, "GET", "/auth/me", 401, headers=bearer)


def test_web_session_survives_worker_switch_and_revocation(monkeypatch):
    monkeypatch.delenv("NTRIP_SESSION_SECRET", raising=False)
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "sb_secret_test_only")
    set_supabase_client(FakeClient())
    first, second = create_app().test_client(), create_app().test_client()
    credentials = {"login_id": "worker-test", "password": "test-password", "nickname": "팀장"}
    assert first.post("/api/v1/auth/signup", json=credentials).status_code == 201
    login = first.post("/api/v1/auth/login", json=credentials)
    assert login.status_code == 200
    bearer = {"Authorization": "Bearer " + login.json["data"]["access_token"]}
    assert second.get("/api/v1/auth/me", headers=bearer).status_code == 200
    second.set_cookie("session", first.get_cookie("session").value)
    assert second.get("/api/v1/trips").status_code == 200
    assert second.post("/api/v1/auth/logout").status_code == 200
    assert first.get("/api/v1/auth/me").status_code == 401
    assert first.get("/api/v1/auth/me", headers=bearer).status_code == 401


def test_web_session_signing_key_selection(monkeypatch):
    from config import session_signing_key

    for name in ("NTRIP_SESSION_SECRET", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_KEY"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_public")
    monkeypatch.setenv("SUPABASE_KEY", "x.eyJyb2xlIjoiYW5vbiJ9.y")  # Legacy anon role.
    assert session_signing_key() is None
    set_supabase_client(FakeClient())
    client = create_app().test_client()
    credentials = {"login_id": "public-key", "password": "sample-password", "nickname": "테스트"}
    assert client.post("/api/v1/auth/signup", json=credentials).status_code == 201
    assert client.post("/api/v1/auth/login", json=credentials).status_code == 503
    monkeypatch.setenv("SUPABASE_KEY", "x.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.y")  # Legacy service_role.
    assert session_signing_key() == create_app().secret_key
    assert isinstance(session_signing_key(), bytes)
    monkeypatch.setenv("NTRIP_SESSION_SECRET", "existing-fixed-test-key")
    assert create_app().secret_key == "existing-fixed-test-key"
