from io import BytesIO

import pytest
from werkzeug.security import generate_password_hash

from app.extensions import db
from app.models import User


def admin_headers(app, client):
    with app.app_context():
        user = User(
            email="upload-admin@yupi.test",
            password_hash=generate_password_hash("UploadTestPassword123!"),
            role="super_admin",
        )
        db.session.add(user)
        db.session.commit()
    response = client.post(
        "/api/auth/login",
        json={
            "email": "upload-admin@yupi.test",
            "password": "UploadTestPassword123!",
        },
    )
    return {"Authorization": f"Bearer {response.json['access_token']}"}


def test_image_upload_requires_admin(app, client):
    response = client.post(
        "/api/admin/uploads/images",
        data={"image": (BytesIO(b"\x89PNG\r\n\x1a\nimage-data"), "product.png")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 401


@pytest.mark.parametrize(
    ("filename", "content_type", "data", "expected_extension"),
    [
        ("local-photo.png", "image/png", b"\x89PNG\r\n\x1a\nimage-data", ".png"),
        ("local-photo.jpg", "image/jpeg", b"\xff\xd8\xffimage-data", ".jpg"),
        ("local-photo.webp", "image/webp", b"RIFFdataWEBPimage-data", ".webp"),
    ],
)
def test_admin_can_upload_and_serve_supported_images(
    app, client, tmp_path, filename, content_type, data, expected_extension
):
    app.config["UPLOAD_FOLDER"] = str(tmp_path)
    headers = admin_headers(app, client)

    response = client.post(
        "/api/admin/uploads/images",
        data={"image": (BytesIO(data), filename, content_type)},
        headers=headers,
        content_type="multipart/form-data",
    )

    assert response.status_code == 201
    image_url = response.json["image_url"]
    assert image_url.startswith("/api/uploads/images/")
    assert image_url.endswith(expected_extension)
    served = client.get(image_url)
    assert served.status_code == 200
    assert served.data == data
    assert served.headers["X-Content-Type-Options"] == "nosniff"


def test_image_upload_rejects_unsupported_and_mismatched_files(app, client):
    headers = admin_headers(app, client)
    unsupported = client.post(
        "/api/admin/uploads/images",
        data={"image": (BytesIO(b"<svg></svg>"), "image.svg", "image/svg+xml")},
        headers=headers,
        content_type="multipart/form-data",
    )
    mismatched = client.post(
        "/api/admin/uploads/images",
        data={"image": (BytesIO(b"not an image"), "image.png", "image/png")},
        headers=headers,
        content_type="multipart/form-data",
    )

    assert unsupported.status_code == 400
    assert mismatched.status_code == 400


def test_image_upload_rejects_files_larger_than_five_megabytes(app, client):
    headers = admin_headers(app, client)
    too_large = client.post(
        "/api/admin/uploads/images",
        data={
            "image": (
                BytesIO(b"\x89PNG\r\n\x1a\n" + b"x" * (5 * 1024 * 1024)),
                "large.png",
                "image/png",
            )
        },
        headers=headers,
        content_type="multipart/form-data",
    )

    assert too_large.status_code == 413
    assert too_large.json["error"] == "The image must be 5 MB or smaller."
