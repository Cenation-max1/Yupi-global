from decimal import Decimal

from app.extensions import db
from app.models import Category, Kit, KitItem, Order, OrderItem, Product, User
from werkzeug.security import generate_password_hash


def create_catalog():
    category = Category(name="Bien-être", slug="bien-etre")
    product = Product(
        category=category,
        sku="BIEN-001",
        slug="produit-bien-etre",
        name="Produit bien-être",
        price=Decimal("12.50"),
        stock_quantity=10,
        image_url="/api/uploads/images/produit.jpg",
    )
    kit = Kit(
        category=category,
        sku="BIEN-KIT-001",
        slug="kit-bien-etre",
        name="Kit bien-être",
        price=Decimal("20.00"),
        items=[KitItem(product=product, quantity=2)],
    )
    db.session.add_all([product, kit])
    db.session.commit()
    return product.id, kit.id


def checkout_payload(items):
    return {
        "customer_name": "Awa Diallo",
        "phone": "+221 77 123 45 67",
        "email": "awa@example.test",
        "city": "Dakar",
        "neighborhood": "Plateau",
        "delivery_landmark": "Près de la mairie",
        "marketing_consent": False,
        "items": items,
    }


def admin_headers(app, client, role="super_admin"):
    with app.app_context():
        user = User(
            email=f"{role}@orders.test",
            password_hash=generate_password_hash("OrdersTestPassword123!"),
            role=role,
        )
        db.session.add(user)
        db.session.commit()
    response = client.post(
        "/api/auth/login",
        json={
            "email": f"{role}@orders.test",
            "password": "OrdersTestPassword123!",
        },
    )
    return {"Authorization": f"Bearer {response.json['access_token']}"}


def test_checkout_creates_pending_order_using_catalog_prices(app, client):
    app.config["RATELIMIT_ENABLED"] = False
    with app.app_context():
        product_id, kit_id = create_catalog()

    response = client.post(
        "/api/orders",
        json=checkout_payload(
            [
                {"kind": "product", "id": product_id, "quantity": 2, "price": "0.01"},
                {"kind": "kit", "id": kit_id, "quantity": 1},
            ]
        ),
    )

    assert response.status_code == 201
    assert response.json["order"]["status"] == "pending"
    assert response.json["order"]["total"] == "45.00"
    assert response.json["order"]["order_number"].startswith("YUPI-")
    with app.app_context():
        order = Order.query.one()
        assert order.payment_method == "cash_on_delivery"
        assert order.subtotal == Decimal("45.00")
        assert order.total == Decimal("45.00")
        assert order.customer.marketing_consent is False
        assert [(item.item_name, item.quantity, item.unit_price) for item in order.items] == [
            ("Produit bien-être", 2, Decimal("12.50")),
            ("Kit bien-être", 1, Decimal("20.00")),
        ]
        assert order.items[0].image_url == "/api/uploads/images/produit.jpg"


def test_order_list_is_restricted_to_admins(app, client):
    assert client.get("/api/orders").status_code == 401
    seller_headers = admin_headers(app, client, role="seller")

    assert client.get("/api/orders", headers=seller_headers).status_code == 403


def test_super_admin_can_view_order_details_and_filter_by_status(app, client):
    app.config["RATELIMIT_ENABLED"] = False
    with app.app_context():
        product_id, _ = create_catalog()
    checkout = client.post(
        "/api/orders",
        json=checkout_payload([{"kind": "product", "id": product_id, "quantity": 2}]),
    )
    headers = admin_headers(app, client)

    response = client.get("/api/orders", headers=headers)
    assert response.status_code == 200
    assert len(response.json["items"]) == 1
    order = response.json["items"][0]
    assert order["order_number"] == checkout.json["order"]["order_number"]
    assert order["status"] == "pending"
    assert order["customer_name"] == "Awa Diallo"
    assert order["phone"] == "+221 77 123 45 67"
    assert order["total"] == "25.00"
    assert order["items"] == [
        {
            "kind": "product",
            "name": "Produit bien-être",
            "image_url": "/api/uploads/images/produit.jpg",
            "quantity": 2,
            "unit_price": "12.50",
            "discount_amount": "0.00",
        }
    ]
    assert client.get("/api/orders?status=delivered", headers=headers).json["items"] == []
    assert client.get("/api/orders?status=unknown", headers=headers).status_code == 400


def test_checkout_rejects_invalid_or_unavailable_items(app, client):
    app.config["RATELIMIT_ENABLED"] = False
    with app.app_context():
        product_id, _ = create_catalog()

    invalid_quantity = client.post(
        "/api/orders",
        json=checkout_payload([{"kind": "product", "id": product_id, "quantity": True}]),
    )
    assert invalid_quantity.status_code == 400

    with app.app_context():
        db.session.get(Product, product_id).is_active = False
        db.session.commit()

    unavailable_product = client.post(
        "/api/orders",
        json=checkout_payload([{"kind": "product", "id": product_id, "quantity": 1}]),
    )
    assert unavailable_product.status_code == 409
    with app.app_context():
        assert Order.query.count() == 0
        assert OrderItem.query.count() == 0


def test_checkout_validates_customer_and_item_payload(app, client):
    app.config["RATELIMIT_ENABLED"] = False

    missing_address = checkout_payload([{"kind": "product", "id": 1, "quantity": 1}])
    missing_address.pop("city")
    assert client.post("/api/orders", json=missing_address).status_code == 400

    invalid_email = checkout_payload([{"kind": "product", "id": 1, "quantity": 1}])
    invalid_email["email"] = "not-an-email"
    assert client.post("/api/orders", json=invalid_email).status_code == 400

    assert client.post("/api/orders", json=checkout_payload([])).status_code == 400


def test_checkout_is_rate_limited(app, client):
    app.config["RATELIMIT_ENABLED"] = True
    with app.app_context():
        product_id, _ = create_catalog()

    payload = checkout_payload([{"kind": "product", "id": product_id, "quantity": 1}])
    responses = [client.post("/api/orders", json=payload) for _ in range(6)]

    assert [response.status_code for response in responses[:5]] == [201] * 5
    assert responses[5].status_code == 429
