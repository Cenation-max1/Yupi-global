import { ArrowLeft, ArrowRight, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCart } from '../cart/CartContext'
import type { CartItem } from '../cart/CartContext'
import StoreHeader from '../components/StoreHeader'

function formatAmount(amount: number) {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function CartRow({ item }: { item: CartItem }) {
  const { removeItem, setQuantity } = useCart()
  const detailPath = `/${item.kind === 'kit' ? 'kits' : 'products'}/${item.slug}`

  return (
    <article className="cart-row">
      <Link className="cart-row-image" to={detailPath}>
        <img
          src={item.imageUrl || '/yupi-hero.jpg'}
          alt={item.imageUrl ? item.name : 'Feuillage vert, image illustrative'}
        />
      </Link>
      <div className="cart-row-info">
        <span className="shop-card-category">{item.kind === 'kit' ? 'Kit' : 'Produit'} · {item.categoryName}</span>
        <h2><Link to={detailPath}>{item.name}</Link></h2>
        <strong className="cart-row-price">{formatAmount(item.price)}</strong>
      </div>
      <div className="cart-row-actions">
        <div className="quantity-control" aria-label={`Quantité de ${item.name}`}>
          <button
            type="button"
            aria-label={`Diminuer la quantité de ${item.name}`}
            onClick={() => setQuantity(item.key, item.quantity - 1)}
          >
            <Minus size={15} aria-hidden="true" />
          </button>
          <span aria-live="polite">{item.quantity}</span>
          <button
            type="button"
            aria-label={`Augmenter la quantité de ${item.name}`}
            disabled={item.quantity >= 99}
            onClick={() => setQuantity(item.key, item.quantity + 1)}
          >
            <Plus size={15} aria-hidden="true" />
          </button>
        </div>
        <strong className="cart-line-total">{formatAmount(item.price * item.quantity)}</strong>
        <button
          className="cart-remove"
          type="button"
          aria-label={`Supprimer ${item.name} du panier`}
          onClick={() => removeItem(item.key)}
        >
          <Trash2 size={17} aria-hidden="true" />
        </button>
      </div>
    </article>
  )
}

export default function CartPage() {
  const { items, itemCount, subtotal, clearCart } = useCart()

  return (
    <div className="store-page">
      <StoreHeader />
      <main className="cart-main">
        <div className="cart-title-row">
          <div>
            <p className="eyebrow"><span /> Votre sélection</p>
            <h1>Mon panier<span className="cart-title-count">{itemCount}</span></h1>
          </div>
          {items.length > 0 && (
            <button className="cart-clear-button" type="button" onClick={clearCart}>Vider le panier</button>
          )}
        </div>

        {items.length === 0 ? (
          <section className="cart-empty">
            <span className="cart-empty-icon"><ShoppingBag size={27} aria-hidden="true" /></span>
            <h2>Votre panier est encore vide.</h2>
            <p>Parcourez la boutique et ajoutez les articles qui vous intéressent.</p>
            <Link className="button button-primary" to="/boutique">
              Découvrir la boutique <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </section>
        ) : (
          <div className="cart-layout">
            <section className="cart-items" aria-label="Articles du panier">
              {items.map((item) => <CartRow item={item} key={item.key} />)}
              <Link className="cart-continue" to="/boutique">
                <ArrowLeft size={16} aria-hidden="true" /> Continuer mes achats
              </Link>
            </section>
            <aside className="cart-summary" aria-labelledby="summary-title">
              <p className="detail-kicker">Récapitulatif</p>
              <h2 id="summary-title">Votre commande</h2>
              <div className="summary-row"><span>Articles</span><span>{itemCount}</span></div>
              <div className="summary-row summary-total"><strong>Sous-total</strong><strong>{formatAmount(subtotal)}</strong></div>
              <p className="summary-delivery">Paiement à la livraison.</p>
              <button className="button button-primary checkout-next" type="button" disabled>
                Finaliser la commande <ArrowRight size={17} aria-hidden="true" />
              </button>
              <p className="checkout-note">Le bon de commande sera disponible à l’étape suivante.</p>
            </aside>
          </div>
        )}
      </main>
    </div>
  )
}
