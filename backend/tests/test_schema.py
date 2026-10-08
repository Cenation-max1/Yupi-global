from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models import Category, Kit, KitItem, Order, OrderItem, Product


def test_health_endpoint(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json == {"status": "ok"}


def test_catalog_kit_and_order_relations(app):
    with app.app_context():
        category = Category(name="Fertilite", slug="fertilite")
        product = Product(
            category=category,
            sku="PROD-001",
            slug="produit-exemple",
            name="Produit exemple",
            price=Decimal("12.50"),
        )
        kit = Kit(
            category=category,
            sku="KIT-001",
            slug="kit-exemple",
            name="Kit exemple",
            price=Decimal("20.00"),
            items=[KitItem(product=product, quantity=2)],
        )
        order = Order(
            order_number="YUPI-TEST-001",
            customer_name="Client test",
            phone="00000000",
            city="Ville",
            neighborhood="Quartier",
            delivery_landmark="Carrefour central",
            subtotal=Decimal("20.00"),
            total=Decimal("20.00"),
            items=[
                OrderItem(
                    kit=kit,
                    item_name=kit.name,
                    quantity=1,
                    unit_price=kit.price,
                )
            ],
        )
        db.session.add(order)
        db.session.commit()

        saved_order = db.session.get(Order, order.id)
        assert saved_order.items[0].kit.items[0].product.name == "Produit exemple"
        assert saved_order.items[0].unit_price == Decimal("20.00")


def test_order_item_must_reference_exactly_one_catalog_type(app):
    with app.app_context():
        order = Order(
            order_number="YUPI-TEST-002",
            customer_name="Client test",
            phone="00000000",
            city="Ville",
            neighborhood="Quartier",
            delivery_landmark="Carrefour central",
            subtotal=Decimal("1.00"),
            total=Decimal("1.00"),
        )
        invalid_item = OrderItem(
            order=order,
            item_name="Ligne invalide",
            quantity=1,
            unit_price=Decimal("1.00"),
        )
        db.session.add(invalid_item)

        with pytest.raises(IntegrityError):
            db.session.commit()

        db.session.rollback()