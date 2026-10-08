from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from flask_jwt_extended import (
    create_access_token,
    get_jwt,
    jwt_required,
)
from sqlalchemy import func, select
from werkzeug.security import check_password_hash

from .extensions import db, jwt
from .models import RevokedToken, User
from .security import load_authenticated_user

auth = Blueprint("auth", __name__, url_prefix="/api/auth")


@jwt.token_in_blocklist_loader
def token_is_revoked(_, jwt_payload):
    revoked_token = db.session.scalar(
        select(RevokedToken.id).where(RevokedToken.jti == jwt_payload["jti"])
    )
    return revoked_token is not None


def serialize_user(user):
    return {"id": user.id, "email": user.email, "role": user.role}


@auth.post("/login")
def login():
    credentials = request.get_json(silent=True)
    if not isinstance(credentials, dict):
        return jsonify(error="invalid_request"), 400

    email = credentials.get("email")
    password = credentials.get("password")
    if not isinstance(email, str) or not isinstance(password, str):
        return jsonify(error="invalid_request"), 400

    user = db.session.scalar(
        select(User).where(func.lower(User.email) == email.strip().lower())
    )
    if (
        user is None
        or not user.is_active
        or not check_password_hash(user.password_hash, password)
    ):
        return jsonify(error="invalid_credentials"), 401

    access_token = create_access_token(identity=str(user.id))
    return jsonify(access_token=access_token, token_type="Bearer", user=serialize_user(user))


@auth.get("/me")
@jwt_required()
def me():
    user = load_authenticated_user()
    if user is None or not user.is_active:
        return jsonify(error="invalid_or_inactive_account"), 401
    return jsonify(user=serialize_user(user))


@auth.post("/logout")
@jwt_required()
def logout():
    token = get_jwt()
    expires_at = datetime.fromtimestamp(token["exp"], timezone.utc)
    db.session.add(RevokedToken(jti=token["jti"], expires_at=expires_at))
    db.session.commit()
    return "", 204