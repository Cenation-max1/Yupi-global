import os
from datetime import timedelta

import click
from flask import Flask
from werkzeug.security import generate_password_hash

from .extensions import db, jwt, limiter, migrate


def create_app(test_config=None):
    app = Flask(__name__, instance_relative_config=True)
    os.makedirs(app.instance_path, exist_ok=True)
    app.config.from_mapping(
        SECRET_KEY=os.environ.get("SECRET_KEY"),
        JWT_SECRET_KEY=os.environ.get("JWT_SECRET_KEY", os.environ.get("SECRET_KEY")),
        JWT_ACCESS_TOKEN_EXPIRES=timedelta(minutes=30),
        SQLALCHEMY_DATABASE_URI=os.environ.get(
            "DATABASE_URL", "sqlite:///yupi.sqlite"
        ),
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        UPLOAD_FOLDER=os.path.join(app.instance_path, "uploads"),
        MAX_CONTENT_LENGTH=6 * 1024 * 1024,
    )
    if test_config:
        app.config.update(test_config)
    if not app.config.get("SECRET_KEY"):
        raise RuntimeError("Set SECRET_KEY before starting the application.")
    if not app.config.get("JWT_SECRET_KEY"):
        app.config["JWT_SECRET_KEY"] = app.config["SECRET_KEY"]

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    limiter.init_app(app)

    from . import models
    from .auth import auth
    from .catalog import admin_catalog, public_catalog
    from .orders import orders
    from .routes import api
    from .social import admin_social, public_social
    from .uploads import uploads as image_uploads

    app.register_blueprint(api)
    app.register_blueprint(auth)
    app.register_blueprint(public_catalog)
    app.register_blueprint(admin_catalog)
    app.register_blueprint(orders)
    app.register_blueprint(public_social)
    app.register_blueprint(admin_social)
    app.register_blueprint(image_uploads)

    @app.cli.command("create-super-admin")
    @click.option("--email", prompt=True)
    @click.password_option()
    def create_super_admin(email, password):
        """Create a privileged account through a local interactive prompt."""
        normalized_email = email.strip().lower()
        if "@" not in normalized_email:
            raise click.ClickException("Enter a valid email address.")
        if len(password) < 12:
            raise click.ClickException("Use a password with at least 12 characters.")
        if models.User.query.filter_by(email=normalized_email).first():
            raise click.ClickException("An account already uses this email.")

        user = models.User(
            email=normalized_email,
            password_hash=generate_password_hash(password),
            role="super_admin",
        )
        db.session.add(user)
        db.session.commit()
        click.echo(f"Super Admin created: {normalized_email}")

    @app.cli.command("prune-revoked-tokens")
    def prune_revoked_tokens():
        """Remove expired token revocations from the database."""
        from .models import RevokedToken, utc_now

        deleted_count = RevokedToken.query.filter(
            RevokedToken.expires_at < utc_now()
        ).delete(synchronize_session=False)
        db.session.commit()
        click.echo(f"Removed {deleted_count} expired token revocations.")

    return app