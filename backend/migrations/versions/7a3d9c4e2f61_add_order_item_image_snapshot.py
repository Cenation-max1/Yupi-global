"""Add order item image snapshot

Revision ID: 7a3d9c4e2f61
Revises: 3120c2f1a3d0
Create Date: 2026-10-08 08:04:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "7a3d9c4e2f61"
down_revision = "3120c2f1a3d0"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("order_item", sa.Column("image_url", sa.String(length=500), nullable=True))
    op.execute(
        "UPDATE order_item SET image_url = "
        "(SELECT product.image_url FROM product WHERE product.id = order_item.product_id) "
        "WHERE product_id IS NOT NULL"
    )
    op.execute(
        "UPDATE order_item SET image_url = "
        "(SELECT kit.image_url FROM kit WHERE kit.id = order_item.kit_id) "
        "WHERE kit_id IS NOT NULL"
    )


def downgrade():
    op.drop_column("order_item", "image_url")
