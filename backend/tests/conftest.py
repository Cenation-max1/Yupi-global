import pytest

from app import create_app
from app.extensions import db


@pytest.fixture
def app():
    application = create_app(
        {
            "TESTING": True,
            "SECRET_KEY": "test-secret-key-for-hmac-signing-32-bytes",
            "JWT_SECRET_KEY": "test-jwt-secret-key-for-hmac-signing-32-bytes",
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        }
    )
    with application.app_context():
        db.create_all()
        yield application
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()