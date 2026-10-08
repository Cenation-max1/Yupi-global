import re
from decimal import Decimal, InvalidOperation
from urllib.parse import urlparse

from flask import Blueprint, jsonify, request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from .extensions import db
from .models import Category, Kit, KitItem, Product
from .security import roles_required

public_catalog = Blueprint("public_catalog", __name__, url_prefix="/api/catalog")
admin_catalog = Blueprint("admin_catalog", __name__, url_prefix="/api/admin/catalog")

_slug_pattern = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_money_limit = Decimal("100000000")


def _error(message, status=400):
    return jsonify(error=message), status


def _request_data():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None, _error("A JSON object is required.")
    return data, None


def _text(data, key, *, required=True, maximum=180):
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


def _slug(data):
    value, error = _text(data, "slug", maximum=160)
    if error:
        return None, error
    if not _slug_pattern.fullmatch(value):
        return None, "slug must contain lowercase letters, numbers, and hyphens."
    return value, None


def _money(data, key="price"):
    try:
        value = Decimal(str(data.get(key)))
    except (InvalidOperation, TypeError, ValueError):
        return None, f"{key} must be a valid amount."
    if not value.is_finite() or value < 0 or value >= _money_limit:
        return None, f"{key} is outside the allowed range."
    if value.as_tuple().exponent < -2:
        return None, f"{key} may have at most two decimal places."
    return value.quantize(Decimal("0.01")), None


def _image_url(data):
    value, error = _text(data, "image_url", required=False, maximum=500)
    if error or value is None:
        return value, error
    if value.startswith("//"):
        return None, "image_url must use a local path or an HTTP(S) URL."
    if value.startswith("/"):
        return value, None
    if urlparse(value).scheme not in {"http", "https"}:
        return None, "image_url must use a local path or an HTTP(S) URL."
    return value, None


def _category_data(category):
    return {
        "id": category.id,
        "name": category.name,
        "slug": category.slug,
        "description": category.description,
    }


def _product_data(product, *, admin=False):
    data = {
        "id": product.id,
        "slug": product.slug,
        "name": product.name,
        "description": product.description,
        "price": format(product.price, ".2f"),
        "image_url": product.image_url,
        "category": _category_data(product.category),
    }
    if admin:
        data.update(
            sku=product.sku,
            stock_quantity=product.stock_quantity,
            is_active=product.is_active,
        )
    return data


def _kit_data(kit, *, admin=False):
    items = [
        {
            "quantity": item.quantity,
            "product": _product_data(item.product, admin=admin),
        }
        for item in kit.items
        if admin or item.product.is_active
    ]
    data = {
        "id": kit.id,
        "slug": kit.slug,
        "name": kit.name,
        "description": kit.description,
        "price": format(kit.price, ".2f"),
        "image_url": kit.image_url,
        "category": _category_data(kit.category),
        "items": items,
    }
    if admin:
        data.update(sku=kit.sku, is_active=kit.is_active)
    return data


def _category_is_active(category_id):
    return db.session.scalar(
        select(Category.id).where(
            Category.id == category_id, Category.is_active.is_(True)
        )
    ) is not None


def _parse_category_id(data, *, required=True):
    value = data.get("category_id")
    if value is None and not required:
        return None, None
    category_id, error = _integer(value, "category_id", minimum=1)
    if error:
        return None, "category_id must be a valid category."
    if not _category_is_active(category_id):
        return None, "category_id must refer to an active category."
    return category_id, None


def _parse_active(data):
    value = data.get("is_active")
    if not isinstance(value, bool):
        return None, "is_active must be true or false."
    return value, None


def _parse_stock(data):
    value = data.get("stock_quantity")
    if value is None:
        return 0, None
    return _integer(value, "stock_quantity", minimum=0)


def _integer(value, field, *, minimum):
    if isinstance(value, bool):
        return None, f"{field} must be an integer greater than or equal to {minimum}."
    if isinstance(value, int):
        parsed = value
    elif isinstance(value, str) and value.strip().isdecimal():
        parsed = int(value.strip())
    else:
        return None, f"{field} must be an integer greater than or equal to {minimum}."
    if parsed < minimum:
        return None, f"{field} must be an integer greater than or equal to {minimum}."
    return parsed, None


def _commit_or_conflict():
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return _error("A catalog record with those values already exists.", 409)
    return None


def _kit_items(data):
    value = data.get("items")
    if not isinstance(value, list) or not value:
        return None, "items must contain at least one product."
    parsed_items = []
    seen_ids = set()
    for item in value:
        if not isinstance(item, dict):
            return None, "Each kit item must be an object."
        product_id, error = _integer(item.get("product_id"), "product_id", minimum=1)
        if error:
            return None, error
        quantity, error = _integer(item.get("quantity"), "quantity", minimum=1)
        if error:
            return None, error
        if product_id in seen_ids:
            return None, "Kit products must be unique and quantities must be positive."
        product = db.session.get(Product, product_id)
        if product is None or not product.is_active:
            return None, "Every kit item must refer to an active product."
        parsed_items.append((product, quantity))
        seen_ids.add(product_id)
    return parsed_items, None


def _filtered_items(query, model, *, admin=False):
    category_slug = request.args.get("category")
    if not admin:
        query = query.where(model.is_active.is_(True), Category.is_active.is_(True))
    if category_slug:
        query = query.where(Category.slug == category_slug)
    return query


@public_catalog.get("/categories")
def list_categories():
    categories = db.session.scalars(
        select(Category)
        .where(Category.is_active.is_(True))
        .order_by(Category.name)
    ).all()
    return jsonify(items=[_category_data(category) for category in categories])


@public_catalog.get("/products")
def list_products():
    query = _filtered_items(
        select(Product).join(Category), Product
    ).order_by(Product.name)
    products = db.session.scalars(query).all()
    return jsonify(items=[_product_data(product) for product in products])


@public_catalog.get("/products/<string:slug>")
def get_product(slug):
    product = db.session.scalar(
        select(Product)
        .join(Category)
        .where(
            Product.slug == slug,
            Product.is_active.is_(True),
            Category.is_active.is_(True),
        )
    )
    if product is None:
        return _error("Product not found.", 404)
    return jsonify(item=_product_data(product))


@public_catalog.get("/kits")
def list_kits():
    query = _filtered_items(select(Kit).join(Category), Kit).order_by(Kit.name)
    kits = db.session.scalars(query).all()
    kits = [kit for kit in kits if kit.items and all(item.product.is_active for item in kit.items)]
    return jsonify(items=[_kit_data(kit) for kit in kits])


@public_catalog.get("/kits/<string:slug>")
def get_kit(slug):
    kit = db.session.scalar(
        select(Kit)
        .join(Category)
        .where(
            Kit.slug == slug,
            Kit.is_active.is_(True),
            Category.is_active.is_(True),
        )
    )
    if kit is None or not kit.items or any(not item.product.is_active for item in kit.items):
        return _error("Kit not found.", 404)
    return jsonify(item=_kit_data(kit))


@admin_catalog.get("/categories")
@roles_required("admin", "super_admin")
def admin_list_categories():
    categories = db.session.scalars(select(Category).order_by(Category.name)).all()
    return jsonify(items=[{**_category_data(item), "is_active": item.is_active} for item in categories])


@admin_catalog.post("/categories")
@roles_required("admin", "super_admin")
def create_category():
    data, error = _request_data()
    if error:
        return error
    name, error = _text(data, "name", maximum=120)
    if error:
        return _error(error)
    slug, error = _slug(data)
    if error:
        return _error(error)
    description, error = _text(data, "description", required=False, maximum=5000)
    if error:
        return _error(error)
    category = Category(name=name, slug=slug, description=description)
    db.session.add(category)
    conflict = _commit_or_conflict()
    if conflict:
        return conflict
    return jsonify(item={**_category_data(category), "is_active": category.is_active}), 201


@admin_catalog.patch("/categories/<int:category_id>")
@roles_required("admin", "super_admin")
def update_category(category_id):
    category = db.session.get(Category, category_id)
    if category is None:
        return _error("Category not found.", 404)
    data, error = _request_data()
    if error:
        return error
    if "name" in data:
        category.name, error = _text(data, "name", maximum=120)
        if error:
            return _error(error)
    if "slug" in data:
        category.slug, error = _slug(data)
        if error:
            return _error(error)
    if "description" in data:
        category.description, error = _text(data, "description", required=False, maximum=5000)
        if error:
            return _error(error)
    if "is_active" in data:
        category.is_active, error = _parse_active(data)
        if error:
            return _error(error)
    conflict = _commit_or_conflict()
    if conflict:
        return conflict
    return jsonify(item={**_category_data(category), "is_active": category.is_active})


@admin_catalog.delete("/categories/<int:category_id>")
@roles_required("admin", "super_admin")
def deactivate_category(category_id):
    category = db.session.get(Category, category_id)
    if category is None:
        return _error("Category not found.", 404)
    category.is_active = False
    conflict = _commit_or_conflict()
    if conflict:
        return conflict
    return "", 204


@admin_catalog.get("/products")
@roles_required("admin", "super_admin")
def admin_list_products():
    products = db.session.scalars(
        select(Product).join(Category).order_by(Product.name)
    ).all()
    return jsonify(items=[_product_data(item, admin=True) for item in products])


@admin_catalog.post("/products")
@roles_required("admin", "super_admin")
def create_product():
    data, error = _request_data()
    if error:
        return error
    category_id, error = _parse_category_id(data)
    if error:
        return _error(error)
    sku, error = _text(data, "sku", maximum=60)
    if error:
        return _error(error)
    slug, error = _slug(data)
    if error:
        return _error(error)
    name, error = _text(data, "name")
    if error:
        return _error(error)
    description, error = _text(data, "description", required=False, maximum=5000)
    if error:
        return _error(error)
    price, error = _money(data)
    if error:
        return _error(error)
    stock_quantity, error = _parse_stock(data)
    if error:
        return _error(error)
    image_url, error = _image_url(data)
    if error:
        return _error(error)
    product = Product(
        category_id=category_id,
        sku=sku,
        slug=slug,
        name=name,
        description=description,
        price=price,
        stock_quantity=stock_quantity,
        image_url=image_url,
    )
    db.session.add(product)
    conflict = _commit_or_conflict()
    if conflict:
        return conflict
    return jsonify(item=_product_data(product, admin=True)), 201


@admin_catalog.patch("/products/<int:product_id>")
@roles_required("admin", "super_admin")
def update_product(product_id):
    product = db.session.get(Product, product_id)
    if product is None:
        return _error("Product not found.", 404)
    data, error = _request_data()
    if error:
        return error
    if "category_id" in data:
        product.category_id, error = _parse_category_id(data)
        if error:
            return _error(error)
    for key, maximum in (("sku", 60), ("name", 180)):
        if key in data:
            value, error = _text(data, key, maximum=maximum)
            if error:
                return _error(error)
            setattr(product, key, value)
    if "slug" in data:
        product.slug, error = _slug(data)
        if error:
            return _error(error)
    if "description" in data:
        product.description, error = _text(data, "description", required=False, maximum=5000)
        if error:
            return _error(error)
    if "price" in data:
        product.price, error = _money(data)
        if error:
            return _error(error)
    if "stock_quantity" in data:
        product.stock_quantity, error = _parse_stock(data)
        if error:
            return _error(error)
    if "image_url" in data:
        product.image_url, error = _image_url(data)
        if error:
            return _error(error)
    if "is_active" in data:
        product.is_active, error = _parse_active(data)
        if error:
            return _error(error)
    conflict = _commit_or_conflict()
    if conflict:
        return conflict
    return jsonify(item=_product_data(product, admin=True))


@admin_catalog.delete("/products/<int:product_id>")
@roles_required("admin", "super_admin")
def deactivate_product(product_id):
    product = db.session.get(Product, product_id)
    if product is None:
        return _error("Product not found.", 404)
    product.is_active = False
    conflict = _commit_or_conflict()
    if conflict:
        return conflict
    return "", 204


@admin_catalog.get("/kits")
@roles_required("admin", "super_admin")
def admin_list_kits():
    kits = db.session.scalars(select(Kit).join(Category).order_by(Kit.name)).all()
    return jsonify(items=[_kit_data(item, admin=True) for item in kits])


@admin_catalog.post("/kits")
@roles_required("admin", "super_admin")
def create_kit():
    data, error = _request_data()
    if error:
        return error
    category_id, error = _parse_category_id(data)
    if error:
        return _error(error)
    sku, error = _text(data, "sku", maximum=60)
    if error:
        return _error(error)
    slug, error = _slug(data)
    if error:
        return _error(error)
    name, error = _text(data, "name")
    if error:
        return _error(error)
    description, error = _text(data, "description", required=False, maximum=5000)
    if error:
        return _error(error)
    price, error = _money(data)
    if error:
        return _error(error)
    image_url, error = _image_url(data)
    if error:
        return _error(error)
    items, error = _kit_items(data)
    if error:
        return _error(error)
    kit = Kit(
        category_id=category_id,
        sku=sku,
        slug=slug,
        name=name,
        description=description,
        price=price,
        image_url=image_url,
        items=[KitItem(product=product, quantity=quantity) for product, quantity in items],
    )
    db.session.add(kit)
    conflict = _commit_or_conflict()
    if conflict:
        return conflict
    return jsonify(item=_kit_data(kit, admin=True)), 201


@admin_catalog.patch("/kits/<int:kit_id>")
@roles_required("admin", "super_admin")
def update_kit(kit_id):
    kit = db.session.get(Kit, kit_id)
    if kit is None:
        return _error("Kit not found.", 404)
    data, error = _request_data()
    if error:
        return error
    if "category_id" in data:
        kit.category_id, error = _parse_category_id(data)
        if error:
            return _error(error)
    for key, maximum in (("sku", 60), ("name", 180)):
        if key in data:
            value, error = _text(data, key, maximum=maximum)
            if error:
                return _error(error)
            setattr(kit, key, value)
    if "slug" in data:
        kit.slug, error = _slug(data)
        if error:
            return _error(error)
    if "description" in data:
        kit.description, error = _text(data, "description", required=False, maximum=5000)
        if error:
            return _error(error)
    if "price" in data:
        kit.price, error = _money(data)
        if error:
            return _error(error)
    if "image_url" in data:
        kit.image_url, error = _image_url(data)
        if error:
            return _error(error)
    if "items" in data:
        items, error = _kit_items(data)
        if error:
            return _error(error)
        kit.items.clear()
        kit.items.extend(
            KitItem(product=product, quantity=quantity)
            for product, quantity in items
        )
    if "is_active" in data:
        kit.is_active, error = _parse_active(data)
        if error:
            return _error(error)
    conflict = _commit_or_conflict()
    if conflict:
        return conflict
    return jsonify(item=_kit_data(kit, admin=True))


@admin_catalog.delete("/kits/<int:kit_id>")
@roles_required("admin", "super_admin")
def deactivate_kit(kit_id):
    kit = db.session.get(Kit, kit_id)
    if kit is None:
        return _error("Kit not found.", 404)
    kit.is_active = False
    conflict = _commit_or_conflict()
    if conflict:
        return conflict
    return "", 204