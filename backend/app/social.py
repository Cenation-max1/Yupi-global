from datetime import timezone
from urllib.parse import urlparse

from flask import Blueprint, jsonify, request
from sqlalchemy import and_, func, or_, select

from .extensions import db, limiter
from .models import Kit, Product, Review, Testimonial, utc_now
from .security import roles_required

public_social = Blueprint("public_social", __name__, url_prefix="/api/catalog")
admin_social = Blueprint("admin_social", __name__, url_prefix="/api/admin")


def _error(message, status=400):
    return jsonify(error=message), status


def _request_data():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None, _error("A JSON object is required.")
    return data, None


def _text(data, key, *, maximum, required=True):
    value = data.get(key)
    if value is None and not required:
        return None, None
    if not isinstance(value, str):
        return None, f"{key} must be text."
    value = value.strip()
    if not value and required:
        return None, f"{key} is required."
    if len(value) > maximum:
        return None, f"{key} must be at most {maximum} characters."
    return value or None, None


def _integer(data, key, *, minimum, maximum=None, default=None):
    value = data.get(key, default)
    if isinstance(value, bool) or not isinstance(value, int):
        return None, f"{key} must be an integer."
    if value < minimum or (maximum is not None and value > maximum):
        return None, f"{key} is outside the allowed range."
    return value, None


def _media_url(data):
    value, error = _text(data, "video_url", maximum=500, required=False)
    if error or value is None:
        return value, error
    parsed = urlparse(value)
    if parsed.scheme not in {"https", "http"} or not parsed.netloc:
        return None, "video_url must be an HTTP(S) URL."
    return value, None


def _target(kind, slug):
    model = Product if kind == "product" else Kit
    statement = select(model).where(model.slug == slug, model.is_active.is_(True))
    if kind == "product":
        statement = statement.join(model.category).where(model.category.has(is_active=True))
    else:
        statement = statement.join(model.category).where(model.category.has(is_active=True))
    return db.session.scalar(statement)


def _target_from_data(data, *, allow_general=False):
    product_slug = data.get("product_slug")
    kit_slug = data.get("kit_slug")
    if product_slug is not None and kit_slug is not None:
        return None, None, "Choose one product or kit, not both."
    if product_slug is None and kit_slug is None:
        if allow_general:
            return None, None, None
        return None, None, "A product_slug or kit_slug is required."
    kind, slug = ("product", product_slug) if product_slug is not None else ("kit", kit_slug)
    if not isinstance(slug, str) or not slug.strip():
        return None, None, "The catalog slug is invalid."
    target = _target(kind, slug.strip())
    if target is None:
        return None, None, f"The active {kind} was not found."
    return target, kind, None


def _testimonial_data(testimonial):
    return {
        "id": testimonial.id,
        "author_name": testimonial.author_name,
        "quote": testimonial.quote,
        "video_url": testimonial.video_url,
        "product_id": testimonial.product_id,
        "kit_id": testimonial.kit_id,
        "created_at": testimonial.created_at.astimezone(timezone.utc).isoformat(),
    }


def _review_data(review):
    return {
        "id": review.id,
        "author_name": review.author_name,
        "rating": review.rating,
        "body": review.body,
        "created_at": review.created_at.astimezone(timezone.utc).isoformat(),
    }


def _commit():
    db.session.commit()


def _testimonial_target_query(query, kind, target):
    if kind == "product":
        return query.where(
            or_(
                Testimonial.product_id == target.id,
                and_(Testimonial.product_id.is_(None), Testimonial.kit_id.is_(None)),
            )
        )
    if kind == "kit":
        return query.where(
            or_(
                Testimonial.kit_id == target.id,
                and_(Testimonial.product_id.is_(None), Testimonial.kit_id.is_(None)),
            )
        )
    return query.where(Testimonial.product_id.is_(None), Testimonial.kit_id.is_(None))


@public_social.get("/testimonials")
def list_testimonials():
    product_slug = request.args.get("product")
    kit_slug = request.args.get("kit")
    if product_slug and kit_slug:
        return _error("Choose a product or a kit filter, not both.")
    kind = "product" if product_slug else "kit" if kit_slug else None
    target = _target(kind, product_slug or kit_slug) if kind else None
    if kind and target is None:
        return _error("The active catalog item was not found.", 404)
    query = select(Testimonial).where(Testimonial.is_published.is_(True))
    query = _testimonial_target_query(query, kind, target).order_by(
        Testimonial.sort_order, Testimonial.created_at.desc()
    )
    items = db.session.scalars(query).all()
    return jsonify(items=[_testimonial_data(item) for item in items])


def _public_reviews(kind, slug):
    target = _target(kind, slug)
    if target is None:
        return _error(f"The active {kind} was not found.", 404)
    target_column = Review.product_id if kind == "product" else Review.kit_id
    query = select(Review).where(target_column == target.id, Review.status == "approved")
    reviews = db.session.scalars(query.order_by(Review.created_at.desc())).all()
    average = db.session.scalar(
        select(func.avg(Review.rating)).where(
            target_column == target.id, Review.status == "approved"
        )
    )
    return jsonify(
        items=[_review_data(review) for review in reviews],
        total=len(reviews),
        average_rating=round(float(average), 2) if average is not None else None,
    )


@public_social.get("/products/<string:slug>/reviews")
def list_product_reviews(slug):
    return _public_reviews("product", slug)


@public_social.get("/kits/<string:slug>/reviews")
def list_kit_reviews(slug):
    return _public_reviews("kit", slug)


def _submit_review(kind, slug):
    target = _target(kind, slug)
    if target is None:
        return _error(f"The active {kind} was not found.", 404)
    data, error = _request_data()
    if error:
        return error
    author_name, error = _text(data, "author_name", maximum=160)
    if error:
        return _error(error)
    body, error = _text(data, "body", maximum=5000)
    if error:
        return _error(error)
    rating, error = _integer(data, "rating", minimum=1, maximum=5)
    if error:
        return _error(error)
    review = Review(
        author_name=author_name,
        body=body,
        rating=rating,
        product_id=target.id if kind == "product" else None,
        kit_id=target.id if kind == "kit" else None,
        status="pending",
    )
    db.session.add(review)
    _commit()
    return jsonify(message="Review submitted for moderation."), 202


@public_social.post("/products/<string:slug>/reviews")
@limiter.limit("5 per hour")
def submit_product_review(slug):
    return _submit_review("product", slug)


@public_social.post("/kits/<string:slug>/reviews")
@limiter.limit("5 per hour")
def submit_kit_review(slug):
    return _submit_review("kit", slug)


@admin_social.get("/testimonials")
@roles_required("admin", "super_admin")
def admin_list_testimonials():
    items = db.session.scalars(
        select(Testimonial).order_by(Testimonial.created_at.desc())
    ).all()
    return jsonify(
        items=[
            {**_testimonial_data(item), "is_published": item.is_published, "sort_order": item.sort_order}
            for item in items
        ]
    )


@admin_social.post("/testimonials")
@roles_required("admin", "super_admin")
def create_testimonial():
    data, error = _request_data()
    if error:
        return error
    author_name, error = _text(data, "author_name", maximum=160)
    if error:
        return _error(error)
    quote, error = _text(data, "quote", maximum=5000)
    if error:
        return _error(error)
    video_url, error = _media_url(data)
    if error:
        return _error(error)
    target, kind, error = _target_from_data(data, allow_general=True)
    if error:
        return _error(error, 404 if "not found" in error else 400)
    is_published = data.get("is_published", False)
    if not isinstance(is_published, bool):
        return _error("is_published must be true or false.")
    sort_order, error = _integer(data, "sort_order", minimum=0, default=0)
    if error:
        return _error(error)
    testimonial = Testimonial(
        author_name=author_name,
        quote=quote,
        video_url=video_url,
        product_id=target.id if kind == "product" else None,
        kit_id=target.id if kind == "kit" else None,
        is_published=is_published,
        sort_order=sort_order,
    )
    db.session.add(testimonial)
    _commit()
    return jsonify(
        item={
            **_testimonial_data(testimonial),
            "is_published": testimonial.is_published,
            "sort_order": testimonial.sort_order,
        }
    ), 201


@admin_social.patch("/testimonials/<int:testimonial_id>")
@roles_required("admin", "super_admin")
def update_testimonial(testimonial_id):
    testimonial = db.session.get(Testimonial, testimonial_id)
    if testimonial is None:
        return _error("Testimonial not found.", 404)
    data, error = _request_data()
    if error:
        return error
    for key, maximum in (("author_name", 160), ("quote", 5000)):
        if key in data:
            value, error = _text(data, key, maximum=maximum)
            if error:
                return _error(error)
            setattr(testimonial, key, value)
    if "video_url" in data:
        testimonial.video_url, error = _media_url(data)
        if error:
            return _error(error)
    if "sort_order" in data:
        testimonial.sort_order, error = _integer(data, "sort_order", minimum=0)
        if error:
            return _error(error)
    if "is_published" in data:
        if not isinstance(data["is_published"], bool):
            return _error("is_published must be true or false.")
        testimonial.is_published = data["is_published"]
    _commit()
    return jsonify(item=_testimonial_data(testimonial))


@admin_social.delete("/testimonials/<int:testimonial_id>")
@roles_required("admin", "super_admin")
def unpublish_testimonial(testimonial_id):
    testimonial = db.session.get(Testimonial, testimonial_id)
    if testimonial is None:
        return _error("Testimonial not found.", 404)
    testimonial.is_published = False
    _commit()
    return "", 204


@admin_social.get("/reviews")
@roles_required("admin", "super_admin")
def admin_list_reviews():
    status = request.args.get("status")
    query = select(Review)
    if status:
        if status not in {"pending", "approved", "rejected"}:
            return _error("status must be pending, approved, or rejected.")
        query = query.where(Review.status == status)
    reviews = db.session.scalars(query.order_by(Review.created_at.desc())).all()
    return jsonify(
        items=[{**_review_data(item), "status": item.status} for item in reviews]
    )


@admin_social.post("/reviews")
@roles_required("admin", "super_admin")
def create_review():
    data, error = _request_data()
    if error:
        return error
    author_name, error = _text(data, "author_name", maximum=160)
    if error:
        return _error(error)
    body, error = _text(data, "body", maximum=5000)
    if error:
        return _error(error)
    rating, error = _integer(data, "rating", minimum=1, maximum=5)
    if error:
        return _error(error)
    target, kind, error = _target_from_data(data)
    if error:
        return _error(error, 404 if "not found" in error else 400)
    review = Review(
        author_name=author_name,
        body=body,
        rating=rating,
        product_id=target.id if kind == "product" else None,
        kit_id=target.id if kind == "kit" else None,
    )
    db.session.add(review)
    _commit()
    return jsonify(item={**_review_data(review), "status": review.status}), 201


@admin_social.patch("/reviews/<int:review_id>")
@roles_required("admin", "super_admin")
def moderate_review(review_id):
    review = db.session.get(Review, review_id)
    if review is None:
        return _error("Review not found.", 404)
    data, error = _request_data()
    if error:
        return error
    status = data.get("status")
    if status not in {"pending", "approved", "rejected"}:
        return _error("status must be pending, approved, or rejected.")
    review.status = status
    _commit()
    return jsonify(item={**_review_data(review), "status": review.status})