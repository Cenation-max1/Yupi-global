import { Leaf, ShoppingBag } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCart } from '../cart/CartContext'

export function CartLink() {
  const { itemCount } = useCart()

  return (
    <Link className="store-cart-link" to="/panier" aria-label={`Panier, ${itemCount} article${itemCount === 1 ? '' : 's'}`}>
      <ShoppingBag size={18} aria-hidden="true" />
      <span>Panier</span>
      <span className="cart-count" aria-live="polite">{itemCount}</span>
    </Link>
  )
}

export default function StoreHeader() {
  return (
    <header className="site-header store-header">
      <div className="header-inner store-header-inner">
        <Link className="brand" to="/" aria-label="Yupi Global, accueil">
          <span className="brand-symbol" aria-hidden="true"><Leaf size={20} /></span>
          <span className="brand-wordmark"><strong>YUPI</strong><span>GLOBAL</span></span>
        </Link>
        <nav className="store-navigation" aria-label="Navigation boutique">
          <Link to="/">Accueil</Link>
          <Link to="/boutique">Boutique</Link>
          <CartLink />
        </nav>
      </div>
    </header>
  )
}
