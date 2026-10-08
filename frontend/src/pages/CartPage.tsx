import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Check, LoaderCircle, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react'
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
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState<{ orderNumber: string; total: string } | null>(null)

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    const values = new FormData(event.currentTarget)
    setSubmitting(true)
    setError('')
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: values.get('customer_name'),
          phone: values.get('phone'),
          email: values.get('email'),
          city: values.get('city'),
          neighborhood: values.get('neighborhood'),
          delivery_landmark: values.get('delivery_landmark'),
          marketing_consent: values.get('marketing_consent') === 'on',
          items: items.map(({ kind, id, quantity }) => ({ kind, id, quantity })),
        }),
      })
      if (response.status === 429) {
        setError('Le nombre de commandes autorisé est atteint. Réessayez plus tard.')
        return
      }
      const result: { order?: { order_number: string; total: string }; error?: string } = await response.json()
      if (!response.ok || !result.order) {
        setError(result.error || 'La commande n’a pas pu être enregistrée. Vérifiez les informations et réessayez.')
        return
      }
      clearCart()
      setConfirmation({
        orderNumber: result.order.order_number,
        total: result.order.total,
      })
    } catch {
      setError('Le service est momentanément indisponible. Votre panier a été conservé ; réessayez plus tard.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="store-page">
      <StoreHeader />
      <main className="cart-main">
        <div className="cart-title-row">
          <div>
            <p className="eyebrow"><span /> Votre sélection</p>
            <h1>{confirmation ? 'Commande confirmée' : 'Mon panier'}{!confirmation && <span className="cart-title-count">{itemCount}</span>}</h1>
          </div>
          {!confirmation && items.length > 0 && (
            <button className="cart-clear-button" type="button" onClick={clearCart}>Vider le panier</button>
          )}
        </div>

        {confirmation ? (
          <section className="cart-empty checkout-confirmation" role="status">
            <span className="cart-empty-icon"><Check size={27} aria-hidden="true" /></span>
            <h2>Merci pour votre commande.</h2>
            <p>Notre équipe vous contactera pour confirmer la livraison et le paiement à la réception.</p>
            <p className="order-reference">Référence : <strong>{confirmation.orderNumber}</strong></p>
            <p className="order-reference">Total confirmé : <strong>{formatAmount(Number(confirmation.total))}</strong></p>
            <Link className="button button-primary" to="/boutique">
              Continuer mes achats <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </section>
        ) : items.length === 0 ? (
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
              <form className="checkout-form" onSubmit={submitOrder}>
                <label>
                  Nom complet
                  <input name="customer_name" type="text" autoComplete="name" maxLength={160} required />
                </label>
                <label>
                  Téléphone
                  <input name="phone" type="tel" autoComplete="tel" maxLength={30} required />
                </label>
                <label>
                  E-mail <span>(facultatif)</span>
                  <input name="email" type="email" autoComplete="email" maxLength={255} />
                </label>
                <label>
                  Ville
                  <input name="city" type="text" autoComplete="address-level2" maxLength={120} required />
                </label>
                <label>
                  Quartier
                  <input name="neighborhood" type="text" maxLength={120} required />
                </label>
                <label>
                  Repère de livraison
                  <textarea name="delivery_landmark" rows={2} maxLength={200} required />
                </label>
                <label className="checkout-consent">
                  <input name="marketing_consent" type="checkbox" />
                  <span>J’accepte de recevoir des informations et offres de Yupi Global.</span>
                </label>
                <button className="button button-primary checkout-next" type="submit" disabled={submitting}>
                  {submitting && <LoaderCircle className="loading-icon" size={17} aria-hidden="true" />}
                  {submitting ? 'Envoi en cours…' : 'Confirmer la commande'}
                  {!submitting && <ArrowRight size={17} aria-hidden="true" />}
                </button>
                {error && <p className="form-message form-message-error" role="alert">{error}</p>}
              </form>
              <p className="checkout-note">Le paiement s’effectue à la livraison. Le total est recalculé à partir du catalogue.</p>
            </aside>
          </div>
        )}
      </main>
    </div>
  )
}
