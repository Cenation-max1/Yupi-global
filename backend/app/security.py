from functools import wraps

from flask import g, jsonify
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

from .extensions import db
from .models import User


def load_authenticated_user():
    try:
        user_id = int(get_jwt_identity())
    except (TypeError, ValueError):
        return None
    return db.session.get(User, user_id)


def roles_required(*allowed_roles):
    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            verify_jwt_in_request()
            user = load_authenticated_user()
            if user is None or not user.is_active:
                return jsonify(error="invalid_or_inactive_account"), 401
            if user.role not in allowed_roles:
                return jsonify(error="insufficient_permissions"), 403
            g.current_user = user
            return view(*args, **kwargs)

        return wrapped

    return decorator