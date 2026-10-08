import re
from decimal import Decimal
from secrets import token_hex

from flask import Blueprint, jsonify, request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from .extensions import db, limiter
from .models import Category, Customer, Kit, Order, OrderItem, Product
from .security import roles_required

orders = Blueprint("orders", __name__, url_prefix="/api/orders")

_email_pattern = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_total_limit = Decimal("100000000")


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


def _catalog_item(kind, item_id):
    model = Product if kind == "product" else Kit
    item = db.session.scalar(
        select(model)
        .join(Category)
        .where(
            model.id == item_id,
            model.is_active.is_(True),
            Category.is_active.is_(True),
        )
    )
    if item is None:
        return None
    if kind == "kit" and (
        not item.items or any(not kit_item.product.is_active for kit_item in item.items)
    ):
        return None
    return item


@orders.get("")
@roles_required("admin", "super_admin")
def list_orders():
    status = request.args.get("status")
    allowed_statuses = {
        "pending",
        "confirmed",
        "preparing",
        "shipped",
        "delivered",
        "cancelled",
    }
    if status and status not in allowed_statuses:
        return jsonify(error="status is not a valid order status."), 400

    query = select(Order).order_by(Order.created_at.desc(), Order.id.desc())
    if status:
        query = query.where(Order.status == status)
    saved_orders = db.session.scalars(query).all()
    return jsonify(
        items=[
            {
                "id": order.id,
                "order_number": order.order_number,
                "status": order.status,
                "payment_method": order.payment_method,
                "customer_name": order.customer_name,
                "phone": order.phone,
                "email": order.email,
                "city": order.city,
                "neighborhood": order.neighborhood,
                "delivery_landmark": order.delivery_landmark,
                "subtotal": format(order.subtotal, ".2f"),
                "discount_total": format(order.discount_total, ".2f"),
                "total": format(order.total, ".2f"),
                "created_at": order.created_at.isoformat(),
                "items": [
                    {
                        "kind": "kit" if item.kit_id is not None else "product",
                        "name": item.item_name,
                        "image_url": (
                            item.image_url
                            or (item.kit.image_url if item.kit_id is not None else item.product.image_url)
                        ),
                        "quantity": item.quantity,
                        "unit_price": format(item.unit_price, ".2f"),
                        "discount_amount": format(item.discount_amount, ".2f"),
                    }
                    for item in order.items
                ],
            }
            for order in saved_orders
        ]
    )


@orders.post("")
@limiter.limit("5 per hour")
def create_order():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(error="A JSON object is required."), 400

    customer_name, error = _text(data, "customer_name", maximum=160)
    if error:
        return jsonify(error=error), 400
    phone, error = _text(data, "phone", maximum=30)
    if error:
        return jsonify(error=error), 400
    email, error = _text(data, "email", maximum=255, required=False)
    if error:
        return jsonify(error=error), 400
    if email and not _email_pattern.fullmatch(email):
        return jsonify(error="email must be a valid email address."), 400
    city, error = _text(data, "city", maximum=120)
    if error:
        return jsonify(error=error), 400
    neighborhood, error = _text(data, "neighborhood", maximum=120)
    if error:
        return jsonify(error=error), 400
    delivery_landmark, error = _text(data, "delivery_landmark", maximum=200)
    if error:
        return jsonify(error=error), 400

    marketing_consent = data.get("marketing_consent", False)
    if not isinstance(marketing_consent, bool):
        return jsonify(error="marketing_consent must be true or false."), 400

    requested_items = data.get("items")
    if not isinstance(requested_items, list) or not requested_items or len(requested_items) > 50:
        return jsonify(error="items must contain between 1 and 50 entries."), 400

    order_items = []
    seen_items = set()
    subtotal = Decimal("0.00")
    for requested_item in requested_items:
        if not isinstance(requested_item, dict):
            return jsonify(error="Each order item must be an object."), 400
        kind = requested_item.get("kind")
        item_id = requested_item.get("id")
        quantity = requested_item.get("quantity")
        if not isinstance(kind, str) or kind not in {"product", "kit"}:
            return jsonify(error="kind must be product or kit."), 400
        if isinstance(item_id, bool) or not isinstance(item_id, int) or item_id < 1:
            return jsonify(error="Each catalog item must have a valid id."), 400
        if isinstance(quantity, bool) or not isinstance(quantity, int) or not 1 <= quantity <= 99:
            return jsonify(error="Each quantity must be an integer from 1 to 99."), 400
        item_key = (kind, item_id)
        if item_key in seen_items:
            return jsonify(error="Order items must be unique."), 400
        seen_items.add(item_key)

        catalog_item = _catalog_item(kind, item_id)
        if catalog_item is None:
            return jsonify(error="An item is no longer available in the catalog."), 409
        line_total = catalog_item.price * quantity
        subtotal += line_total
        if subtotal >= _total_limit:
            return jsonify(error="The order total is outside the allowed range."), 400
        order_items.append(
            OrderItem(
                product_id=catalog_item.id if kind == "product" else None,
                kit_id=catalog_item.id if kind == "kit" else None,
                item_name=catalog_item.name,
                image_url=catalog_item.image_url,
                quantity=quantity,
                unit_price=catalog_item.price,
                discount_amount=Decimal("0.00"),
            )
        )

    customer = Customer(
        name=customer_name,
        phone=phone,
        email=email,
        city=city,
        neighborhood=neighborhood,
        delivery_landmark=delivery_landmark,
        marketing_consent=marketing_consent,
    )
    order = Order(
        order_number=f"YUPI-{token_hex(16).upper()}",
        customer=customer,
        customer_name=customer_name,
        phone=phone,
        email=email,
        city=city,
        neighborhood=neighborhood,
        delivery_landmark=delivery_landmark,
        status="pending",
        payment_method="cash_on_delivery",
        subtotal=subtotal,
        discount_total=Decimal("0.00"),
        total=subtotal,
        items=order_items,
    )
    db.session.add(order)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify(error="The order could not be saved. Please try again."), 409

    return jsonify(
        order={
            "order_number": order.order_number,
            "status": order.status,
            "total": format(order.total, ".2f"),
            "created_at": order.created_at.isoformat(),
        }
    ), 201
