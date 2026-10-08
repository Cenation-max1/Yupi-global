from pathlib import Path
from uuid import uuid4

from flask import Blueprint, current_app, jsonify, request, send_from_directory, url_for
from werkzeug.exceptions import RequestEntityTooLarge

from .extensions import limiter
from .security import roles_required

uploads = Blueprint("uploads", __name__)

_max_image_size = 5 * 1024 * 1024
_image_formats = {
    "image/jpeg": (".jpg", lambda data: data.startswith(b"\xff\xd8\xff")),
    "image/png": (".png", lambda data: data.startswith(b"\x89PNG\r\n\x1a\n")),
    "image/webp": (".webp", lambda data: len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"),
}


@uploads.post("/api/admin/uploads/images")
@roles_required("admin", "super_admin")
@limiter.limit("20 per hour")
def upload_image():
    image = request.files.get("image")
    if image is None or not image.filename:
        return jsonify(error="Choose an image file to upload."), 400

    format_info = _image_formats.get(image.mimetype)
    if format_info is None:
        return jsonify(error="Only JPEG, PNG, and WebP images are supported."), 400

    data = image.stream.read(_max_image_size + 1)
    if not data:
        return jsonify(error="The selected image is empty."), 400
    if len(data) > _max_image_size:
        return jsonify(error="The image must be 5 MB or smaller."), 413

    extension, validate_signature = format_info
    if not validate_signature(data):
        return jsonify(error="The file contents do not match a supported image format."), 400

    filename = f"{uuid4().hex}{extension}"
    upload_folder = Path(current_app.config["UPLOAD_FOLDER"])
    upload_folder.mkdir(parents=True, exist_ok=True)
    (upload_folder / filename).write_bytes(data)

    return jsonify(
        image_url=url_for("uploads.serve_image", filename=filename),
    ), 201


@uploads.get("/api/uploads/images/<string:filename>")
def serve_image(filename):
    response = send_from_directory(
        current_app.config["UPLOAD_FOLDER"],
        filename,
        conditional=True,
        max_age=86400,
    )
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@uploads.app_errorhandler(RequestEntityTooLarge)
def request_too_large(_error):
    return jsonify(error="The image must be 5 MB or smaller."), 413
