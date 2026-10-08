from decimal import Decimal

from werkzeug.security import generate_password_hash

from app.extensions import db
from app.models import Category, Kit, KitItem, Product, User


def admin_headers(app, client):
    with app.app_context():
        user = User(
            email="social-admin@yupi.test",
            password_hash=generate_password_hash("SocialTestPassword123!"),
            role="admin",
        )
        db.session.add(user)
        db.session.commit()

    response = client.post(
        "/api/auth/login",
        json={"email": "social-admin@yupi.test", "password": "SocialTestPassword123!"},
    )
    return {"Authorization": f"Bearer {response.json['access_token']}"}


def catalog_targets(app):
    category = Category(name="Fertilite", slug="fertilite")
    product = Product(
        category=category,
        sku="FERT-001",
        slug="produit-fertilite",
        name="Produit fertilite",
        price=Decimal("25.00"),
    )
    kit = Kit(
        category=category,
        sku="FERT-KIT-001",
        slug="kit-fertilite",
        name="Kit fertilite",
        price=Decimal("40.00"),
        items=[KitItem(product=product, quantity=1)],
    )
    db.session.add(kit)
    db.session.commit()
    return product.id, kit.id


def test_testimonials_require_publication_and_can_be_filtered(app, client):
    with app.app_context():
        catalog_targets(app)
    headers = admin_headers(app, client)

    response = client.post(
        "/api/admin/testimonials",
        json={
            "author_name": "Awa",
            "quote": "Un retour partage avec son accord.",
            "video_url": "https://example.com/temoignage",
            "product_slug": "produit-fertilite",
        },
        headers=headers,
    )
    assert response.status_code == 201
    testimonial_id = response.json["item"]["id"]
    assert response.json["item"]["is_published"] is False
    assert client.get("/api/catalog/testimonials?product=produit-fertilite").json["items"] == []

    published = client.patch(
        f"/api/admin/testimonials/{testimonial_id}",
        json={"is_published": True},
        headers=headers,
    )
    assert published.status_code == 200
    public_items = client.get("/api/catalog/testimonials?product=produit-fertilite").json["items"]
    assert len(public_items) == 1
    assert public_items[0]["author_name"] == "Awa"
    kit_testimonial = client.post(
        "/api/admin/testimonials",
        json={
            "author_name": "Mariam",
            "quote": "Un avis sur le kit.",
            "kit_slug": "kit-fertilite",
            "is_published": True,
        },
        headers=headers,
    )
    assert kit_testimonial.status_code == 201
    kit_items = client.get("/api/catalog/testimonials?kit=kit-fertilite").json["items"]
    assert [item["quote"] for item in kit_items] == ["Un avis sur le kit."]


def test_reviews_remain_hidden_until_approved(app, client):
    with app.app_context():
        catalog_targets(app)
    headers = admin_headers(app, client)

    response = client.post(
        "/api/admin/reviews",
        json={
            "author_name": "Mariam",
            "body": "Commande recue et service disponible.",
            "rating": 5,
            "product_slug": "produit-fertilite",
        },
        headers=headers,
    )
    assert response.status_code == 201
    review_id = response.json["item"]["id"]
    assert response.json["item"]["status"] == "pending"
    assert client.get("/api/catalog/products/produit-fertilite/reviews").json == {
        "average_rating": None,
        "items": [],
        "total": 0,
    }

    pending = client.get("/api/admin/reviews?status=pending", headers=headers)
    assert [item["id"] for item in pending.json["items"]] == [review_id]
    approved = client.patch(
        f"/api/admin/reviews/{review_id}",
        json={"status": "approved"},
        headers=headers,
    )
    assert approved.status_code == 200

    public_reviews = client.get("/api/catalog/products/produit-fertilite/reviews")
    assert public_reviews.json["total"] == 1
    assert public_reviews.json["average_rating"] == 5.0
    assert public_reviews.json["items"][0]["author_name"] == "Mariam"


def test_public_review_submission_is_limited_and_waits_for_moderation(app, client):
    with app.app_context():
        catalog_targets(app)
    app.config["RATELIMIT_ENABLED"] = True
    payload = {
        "author_name": "Client",
        "body": "Mon avis sur le produit.",
        "rating": 4,
    }

    responses = [
        client.post(
            "/api/catalog/products/produit-fertilite/reviews",
            json=payload,
        )
        for _ in range(6)
    ]
    assert [response.status_code for response in responses[:5]] == [202] * 5
    assert responses[5].status_code == 429
    assert client.get("/api/catalog/products/produit-fertilite/reviews").json["total"] == 0

    headers = admin_headers(app, client)
    pending = client.get("/api/admin/reviews?status=pending", headers=headers)
    assert len(pending.json["items"]) == 5
    review_id = pending.json["items"][0]["id"]
    response = client.patch(
        f"/api/admin/reviews/{review_id}",
        json={"status": "approved"},
        headers=headers,
    )
    assert response.status_code == 200
    assert client.get("/api/catalog/products/produit-fertilite/reviews").json["total"] == 1


def test_social_admin_routes_require_privileged_role(app, client):
    assert client.get("/api/admin/reviews").status_code == 401

    with app.app_context():
        user = User(
            email="seller-social@yupi.test",
            password_hash=generate_password_hash("SocialTestPassword123!"),
            role="seller",
        )
        db.session.add(user)
        db.session.commit()
    response = client.post(
        "/api/auth/login",
        json={"email": "seller-social@yupi.test", "password": "SocialTestPassword123!"},
    )
    headers = {"Authorization": f"Bearer {response.json['access_token']}"}

    assert client.get("/api/admin/reviews", headers=headers).status_code == 403
    assert client.post(
        "/api/admin/testimonials", json={}, headers=headers
    ).status_code == 403


def test_social_routes_validate_targets_and_media(app, client):
    with app.app_context():
        catalog_targets(app)
    headers = admin_headers(app, client)

    bad_target = client.post(
        "/api/admin/reviews",
        json={"author_name": "Test", "body": "Texte", "rating": 6, "product_slug": "produit-fertilite"},
        headers=headers,
    )
    assert bad_target.status_code == 400

    bad_media = client.post(
        "/api/admin/testimonials",
        json={
            "author_name": "Test",
            "quote": "Texte",
            "video_url": "javascript:alert(1)",
        },
        headers=headers,
    )
    assert bad_media.status_code == 400

    ambiguous_target = client.post(
        "/api/admin/reviews",
        json={
            "author_name": "Test",
            "body": "Texte",
            "rating": 4,
            "product_slug": "produit-fertilite",
            "kit_slug": "kit-fertilite",
        },
        headers=headers,
    )
    assert ambiguous_target.status_code == 400
