from datetime import datetime, timezone

from sqlalchemy import CheckConstraint

from .extensions import db


def utc_now():
    return datetime.now(timezone.utc)


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), nullable=False, unique=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="seller")
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now)
    __table_args__ = (
        CheckConstraint(
            "role IN ('super_admin', 'admin', 'seller')", name="ck_user_role"
        ),
    )
    seller = db.relationship("Seller", back_populates="user", uselist=False)


class RevokedToken(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    jti = db.Column(db.String(36), nullable=False, unique=True, index=True)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False, index=True)


class Seller(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, unique=True)
    referral_code = db.Column(db.String(40), nullable=False, unique=True)
    display_name = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(30))
    user = db.relationship("User", back_populates="seller")
    orders = db.relationship("Order", back_populates="seller")


class Customer(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(160), nullable=False)
    phone = db.Column(db.String(30), nullable=False, index=True)
    email = db.Column(db.String(255), index=True)
    city = db.Column(db.String(120))
    neighborhood = db.Column(db.String(120))
    delivery_landmark = db.Column(db.String(200))
    marketing_consent = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now)
    orders = db.relationship("Order", back_populates="customer")


class Category(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False, unique=True)
    slug = db.Column(db.String(140), nullable=False, unique=True)
    description = db.Column(db.Text)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    products = db.relationship("Product", back_populates="category")
    kits = db.relationship("Kit", back_populates="category")


class Product(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    category_id = db.Column(db.Integer, db.ForeignKey("category.id"), nullable=False)
    sku = db.Column(db.String(60), nullable=False, unique=True)
    slug = db.Column(db.String(160), nullable=False, unique=True)
    name = db.Column(db.String(180), nullable=False)
    description = db.Column(db.Text)
    price = db.Column(db.Numeric(10, 2), nullable=False)
    stock_quantity = db.Column(db.Integer, nullable=False, default=0)
    image_url = db.Column(db.String(500))
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    category = db.relationship("Category", back_populates="products")
    kit_items = db.relationship("KitItem", back_populates="product")
    __table_args__ = (
        CheckConstraint("price >= 0", name="ck_product_price_nonnegative"),
        CheckConstraint("stock_quantity >= 0", name="ck_product_stock_nonnegative"),
    )


class Kit(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    category_id = db.Column(db.Integer, db.ForeignKey("category.id"), nullable=False)
    sku = db.Column(db.String(60), nullable=False, unique=True)
    slug = db.Column(db.String(160), nullable=False, unique=True)
    name = db.Column(db.String(180), nullable=False)
    description = db.Column(db.Text)
    price = db.Column(db.Numeric(10, 2), nullable=False)
    image_url = db.Column(db.String(500))
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    category = db.relationship("Category", back_populates="kits")
    items = db.relationship("KitItem", back_populates="kit", cascade="all, delete-orphan")
    __table_args__ = (
        CheckConstraint("price >= 0", name="ck_kit_price_nonnegative"),
    )


class Testimonial(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    author_name = db.Column(db.String(160), nullable=False)
    quote = db.Column(db.Text, nullable=False)
    video_url = db.Column(db.String(500))
    product_id = db.Column(db.Integer, db.ForeignKey("product.id"))
    kit_id = db.Column(db.Integer, db.ForeignKey("kit.id"))
    is_published = db.Column(db.Boolean, nullable=False, default=False)
    sort_order = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now)
    __table_args__ = (
        CheckConstraint(
            "product_id IS NULL OR kit_id IS NULL",
            name="ck_testimonial_single_catalog_target",
        ),
        CheckConstraint("sort_order >= 0", name="ck_testimonial_sort_order_nonnegative"),
    )


class Review(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    author_name = db.Column(db.String(160), nullable=False)
    rating = db.Column(db.Integer, nullable=False)
    body = db.Column(db.Text, nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey("product.id"))
    kit_id = db.Column(db.Integer, db.ForeignKey("kit.id"))
    status = db.Column(db.String(20), nullable=False, default="pending")
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now)
    __table_args__ = (
        CheckConstraint("rating BETWEEN 1 AND 5", name="ck_review_rating_range"),
        CheckConstraint(
            "status IN ('pending', 'approved', 'rejected')",
            name="ck_review_moderation_status",
        ),
        CheckConstraint(
            "(product_id IS NOT NULL AND kit_id IS NULL) OR "
            "(product_id IS NULL AND kit_id IS NOT NULL)",
            name="ck_review_single_catalog_target",
        ),
    )


class KitItem(db.Model):
    kit_id = db.Column(db.Integer, db.ForeignKey("kit.id", ondelete="CASCADE"), primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey("product.id"), primary_key=True)
    quantity = db.Column(db.Integer, nullable=False, default=1)
    kit = db.relationship("Kit", back_populates="items")
    product = db.relationship("Product", back_populates="kit_items")
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_kit_item_quantity_positive"),
    )


class Order(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    order_number = db.Column(db.String(40), nullable=False, unique=True)
    customer_id = db.Column(db.Integer, db.ForeignKey("customer.id"))
    seller_id = db.Column(db.Integer, db.ForeignKey("seller.id"))
    customer_name = db.Column(db.String(160), nullable=False)
    phone = db.Column(db.String(30), nullable=False)
    email = db.Column(db.String(255))
    city = db.Column(db.String(120), nullable=False)
    neighborhood = db.Column(db.String(120), nullable=False)
    delivery_landmark = db.Column(db.String(200), nullable=False)
    delivery_date = db.Column(db.Date)
    status = db.Column(db.String(30), nullable=False, default="pending")
    payment_method = db.Column(db.String(30), nullable=False, default="cash_on_delivery")
    subtotal = db.Column(db.Numeric(10, 2), nullable=False)
    discount_total = db.Column(db.Numeric(10, 2), nullable=False, default=0)
    total = db.Column(db.Numeric(10, 2), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now)
    customer = db.relationship("Customer", back_populates="orders")
    seller = db.relationship("Seller", back_populates="orders")
    items = db.relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled')",
            name="ck_order_status",
        ),
        CheckConstraint("subtotal >= 0", name="ck_order_subtotal_nonnegative"),
        CheckConstraint("discount_total >= 0", name="ck_order_discount_nonnegative"),
        CheckConstraint("total >= 0", name="ck_order_total_nonnegative"),
    )


class OrderItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("order.id", ondelete="CASCADE"), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey("product.id"))
    kit_id = db.Column(db.Integer, db.ForeignKey("kit.id"))
    item_name = db.Column(db.String(180), nullable=False)
    image_url = db.Column(db.String(500))
    quantity = db.Column(db.Integer, nullable=False)
    unit_price = db.Column(db.Numeric(10, 2), nullable=False)
    discount_amount = db.Column(db.Numeric(10, 2), nullable=False, default=0)
    order = db.relationship("Order", back_populates="items")
    product = db.relationship("Product")
    kit = db.relationship("Kit")
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_order_item_quantity_positive"),
        CheckConstraint("unit_price >= 0", name="ck_order_item_price_nonnegative"),
        CheckConstraint(
            "(product_id IS NOT NULL AND kit_id IS NULL) OR "
            "(product_id IS NULL AND kit_id IS NOT NULL)",
            name="ck_order_item_single_catalog_type",
        ),
    )