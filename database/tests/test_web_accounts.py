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
