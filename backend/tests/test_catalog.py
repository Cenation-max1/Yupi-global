from decimal import Decimal

from werkzeug.security import generate_password_hash

from app.extensions import db
from app.models import Category, Kit, KitItem, Product, User


def sign_in(app, client, role="admin"):
    with app.app_context():
        user = User(
            email=f"{role}@catalog.test",
            password_hash=generate_password_hash("CatalogTestPassword123!"),
            role=role,
        )
        db.session.add(user)
        db.session.commit()

    response = client.post(
        "/api/auth/login",
        json={"email": f"{role}@catalog.test", "password": "CatalogTestPassword123!"},
    )
    return {"Authorization": f"Bearer {response.json['access_token']}"}


def create_catalog_records(*, active=True, category_active=True, suffix=""):
    category = Category(
        name=f"Fertilite{suffix}", slug=f"fertilite{suffix}", is_active=category_active
    )
    product = Product(
        category=category,
        sku=f"PROD{suffix or '-001'}",
        slug=f"produit{suffix or '-exemple'}",
        name=f"Produit{suffix or ' exemple'}",
        description="Description du produit.",
        price=Decimal("12.50"),
        stock_quantity=4,
        is_active=active,
    )
    kit = Kit(
        category=category,
        sku=f"KIT{suffix or '-001'}",
        slug=f"kit{suffix or '-exemple'}",
        name=f"Kit{suffix or ' exemple'}",
        price=Decimal("20.00"),
        items=[KitItem(product=product, quantity=2)],
    )
    db.session.add(kit)
    db.session.commit()
    return category, product, kit


def test_public_catalog_only_returns_active_records(app, client):
    with app.app_context():
        _, product, kit = create_catalog_records()
        _, inactive_product, inactive_kit = create_catalog_records(
            active=False,
            category_active=False,
            suffix="-inactif",
        )
        db.session.commit()
        product_slug = product.slug
        kit_slug = kit.slug

    categories = client.get("/api/catalog/categories").json["items"]
    products = client.get("/api/catalog/products").json["items"]
    kits = client.get("/api/catalog/kits").json["items"]

    assert [item["slug"] for item in categories] == ["fertilite"]
    assert [item["slug"] for item in products] == ["produit-exemple"]
    assert "stock_quantity" not in products[0]
    assert products[0]["price"] == "12.50"
    assert [item["slug"] for item in kits] == ["kit-exemple"]
    assert kits[0]["items"][0]["quantity"] == 2
    assert client.get(f"/api/catalog/products/{product_slug}").status_code == 200
    assert client.get(f"/api/catalog/kits/{kit_slug}").status_code == 200
    assert client.get("/api/catalog/products/produit-inactif").status_code == 404


def test_catalog_management_requires_admin_role(app, client):
    payload = {"name": "Detox", "slug": "detox"}

    assert client.post("/api/admin/catalog/categories", json=payload).status_code == 401

    seller_headers = sign_in(app, client, role="seller")
    response = client.post(
        "/api/admin/catalog/categories", json=payload, headers=seller_headers
    )
    assert response.status_code == 403

    admin_headers = sign_in(app, client)
    response = client.post(
        "/api/admin/catalog/categories", json=payload, headers=admin_headers
    )
    assert response.status_code == 201
    assert response.json["item"]["slug"] == "detox"


def test_admin_can_manage_products_and_kit_composition(app, client):
    headers = sign_in(app, client)
    category = client.post(
        "/api/admin/catalog/categories",
        json={"name": "Myomes", "slug": "myomes"},
        headers=headers,
    ).json["item"]
    product = client.post(
        "/api/admin/catalog/products",
        json={
            "category_id": category["id"],
            "sku": "MYO-001",
            "slug": "produit-myo",
            "name": "Produit myomes",
            "description": "Description détaillée.",
            "price": "18.50",
            "image_url": "/images/produit-myo.jpg",
        },
        headers=headers,
    )
    assert product.status_code == 201
    assert product.json["item"]["stock_quantity"] == 0
    product_update = client.patch(
        f"/api/admin/catalog/products/{product.json['item']['id']}",
        json={"name": "Produit myomes enrichi", "price": "19.75", "stock_quantity": 5},
        headers=headers,
    )
    assert product_update.status_code == 200
    assert product_update.json["item"]["name"] == "Produit myomes enrichi"
    assert product_update.json["item"]["price"] == "19.75"
    assert product_update.json["item"]["stock_quantity"] == 5

    category_update = client.patch(
        f"/api/admin/catalog/categories/{category['id']}",
        json={"description": "Catégorie de démonstration."},
        headers=headers,
    )
    assert category_update.status_code == 200
    assert category_update.json["item"]["description"] == "Catégorie de démonstration."

    invalid_kit = client.post(
        "/api/admin/catalog/kits",
        json={
            "category_id": category["id"],
            "sku": "MYO-KIT-BAD",
            "slug": "kit-myomes-invalide",
            "name": "Kit invalide",
            "price": "32.00",
            "items": [{"product_id": product.json["item"]["id"], "quantity": 1.5}],
        },
        headers=headers,
    )
    assert invalid_kit.status_code == 400

    kit = client.post(
        "/api/admin/catalog/kits",
        json={
            "category_id": category["id"],
            "sku": "MYO-KIT-001",
            "slug": "kit-myomes",
            "name": "Kit Myomes",
            "price": "32.00",
            "items": [{"product_id": product.json["item"]["id"], "quantity": 2}],
        },
        headers=headers,
    )
    assert kit.status_code == 201
    assert kit.json["item"]["items"][0]["quantity"] == 2

    updated = client.patch(
        f"/api/admin/catalog/kits/{kit.json['item']['id']}",
        json={"price": "30.00", "items": [{"product_id": product.json["item"]["id"], "quantity": 3}]},
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json["item"]["price"] == "30.00"
    assert updated.json["item"]["items"][0]["quantity"] == 3

    deactivated = client.delete(
        f"/api/admin/catalog/products/{product.json['item']['id']}",
        headers=headers,
    )
    assert deactivated.status_code == 204
    assert client.get("/api/catalog/products/produit-myo").status_code == 404
    assert client.get("/api/catalog/kits/kit-myomes").status_code == 404
    assert client.get("/api/admin/catalog/products", headers=headers).json["items"][0]["is_active"] is False


def test_catalog_rejects_invalid_values_and_conflicting_slugs(app, client):
    headers = sign_in(app, client)
    category = client.post(
        "/api/admin/catalog/categories",
        json={"name": "Détox", "slug": "detox"},
        headers=headers,
    )
    assert category.status_code == 201

    duplicate = client.post(
        "/api/admin/catalog/categories",
        json={"name": "Autre nom", "slug": "detox"},
        headers=headers,
    )
    assert duplicate.status_code == 409

    invalid_product = client.post(
        "/api/admin/catalog/products",
        json={
            "category_id": category.json["item"]["id"],
            "sku": "BAD-001",
            "slug": "produit-valide",
            "name": "Produit invalide",
            "price": "-1.00",
        },
        headers=headers,
    )
    assert invalid_product.status_code == 400

    invalid_category = client.post(
        "/api/admin/catalog/categories",
        json={"name": "Slug invalide", "slug": "slug invalide"},
        headers=headers,
    )
    assert invalid_category.status_code == 400