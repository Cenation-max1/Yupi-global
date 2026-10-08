from flask import jsonify
from werkzeug.security import generate_password_hash

from app.extensions import db
from app.models import User
from app.security import roles_required


def create_user(email="seller@yupi.test", role="seller", is_active=True):
    user = User(
        email=email,
        password_hash=generate_password_hash("CorrectHorseBattery12!"),
        role=role,
        is_active=is_active,
    )
    db.session.add(user)
    db.session.commit()
    return user


def login(client, email="seller@yupi.test"):
    return client.post(
        "/api/auth/login",
        json={"email": email, "password": "CorrectHorseBattery12!"},
    )


def test_login_me_and_logout_revoke_access(app, client):
    with app.app_context():
        create_user()

    response = login(client, email="SELLER@yupi.test")
    assert response.status_code == 200
    assert response.json["user"]["role"] == "seller"
    headers = {"Authorization": f"Bearer {response.json['access_token']}"}

    assert client.get("/api/auth/me", headers=headers).json["user"]["email"] == (
        "seller@yupi.test"
    )
    assert client.post("/api/auth/logout", headers=headers).status_code == 204
    assert client.get("/api/auth/me", headers=headers).status_code == 401


def test_login_rejects_bad_password_and_inactive_users(app, client):
    with app.app_context():
        create_user()
        create_user(email="inactive@yupi.test", is_active=False)

    bad_password = client.post(
        "/api/auth/login",
        json={"email": "seller@yupi.test", "password": "wrong"},
    )
    inactive = login(client, email="inactive@yupi.test")

    assert bad_password.status_code == 401
    assert inactive.status_code == 401


def test_role_guard_checks_current_database_role(app, client):
    with app.app_context():
        user = create_user()
        user_id = user.id

    def admin_only():
        return jsonify(allowed=True)

    app.add_url_rule(
        "/test/admin-only",
        view_func=roles_required("admin", "super_admin")(admin_only),
    )
    token = login(client).json["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    assert client.get("/test/admin-only", headers=headers).status_code == 403

    with app.app_context():
        db.session.get(User, user_id).role = "admin"
        db.session.commit()

    assert client.get("/test/admin-only", headers=headers).json == {"allowed": True}


def test_super_admin_is_created_only_through_cli(app):
    result = app.test_cli_runner().invoke(
        args=["create-super-admin"],
        input="root@yupi.test\nCorrectHorseBattery12!\nCorrectHorseBattery12!\n",
    )

    assert result.exit_code == 0, result.output
    with app.app_context():
        user = User.query.filter_by(email="root@yupi.test").one()
        assert user.role == "super_admin"
        assert user.password_hash != "CorrectHorseBattery12!"