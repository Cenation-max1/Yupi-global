import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, LoaderCircle, LogOut, PackageCheck, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'

interface OrderItem {
  kind: 'product' | 'kit'
  name: string
  image_url: string | null
  quantity: number
  unit_price: string
  discount_amount: string
}

interface Order {
  id: number
  order_number: string
  status: string
  payment_method: string
  customer_name: string
  phone: string
  email: string | null
  city: string
  neighborhood: string
  delivery_landmark: string
  subtotal: string
  discount_total: string
  total: string
  created_at: string
  items: OrderItem[]
}

interface AdminUser {
  email: string
  role: 'admin' | 'super_admin'
}

const sessionKey = 'yupi-global-admin-token'
const statusLabels: Record<string, string> = {
  pending: 'En attente',
  confirmed: 'Confirmée',
  preparing: 'En préparation',
  shipped: 'Expédiée',
  delivered: 'Livrée',
  cancelled: 'Annulée',
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : 'Une erreur inattendue est survenue.'
}

function formatAmount(amount: string) {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount))
}

export default function AdminOrdersPage() {
  const [token, setToken] = useState(() => window.sessionStorage.getItem(sessionKey) || '')
  const [user, setUser] = useState<AdminUser | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function loadOrders() {
      if (!token) {
        setError('Connectez-vous depuis l’administration du catalogue pour consulter les commandes.')
        setLoading(false)
        return
      }
      setLoading(true)
      setError('')
      try {
        const [userResponse, orderResponse] = await Promise.all([
          fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/orders', { headers: { Authorization: `Bearer ${token}` } }),
        ])
        const userResult: { user?: AdminUser; error?: string } = await userResponse.json()
        const orderResult: { items?: Order[]; error?: string } = await orderResponse.json()
        if (userResponse.status === 401 || orderResponse.status === 401) {
          throw new Error('Votre session a expiré. Reconnectez-vous à l’administration.')
        }
        if (!userResponse.ok || !orderResponse.ok || !userResult.user || !orderResult.items) {
          throw new Error(orderResult.error || userResult.error || 'Les commandes n’ont pas pu être chargées.')
        }
        if (userResult.user.role !== 'admin' && userResult.user.role !== 'super_admin') {
          throw new Error('Ce compte ne dispose pas des droits d’administration.')
        }
        if (!cancelled) {
          setUser(userResult.user)
          setOrders(orderResult.items)
        }
      } catch (reason) {
        if (!cancelled) {
          setError(describeError(reason))
          if (reason instanceof Error && reason.message.includes('session a expiré')) {
            window.sessionStorage.removeItem(sessionKey)
            setToken('')
            setUser(null)
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadOrders()
    return () => { cancelled = true }
  }, [token, reloadKey])

  const visibleOrders = useMemo(
    () => filter === 'all' ? orders : orders.filter((order) => order.status === filter),
    [filter, orders],
  )

  function signOut() {
    window.sessionStorage.removeItem(sessionKey)
    setToken('')
    setUser(null)
    setOrders([])
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <Link className="admin-brand" to="/">
          <span className="admin-brand-mark">Y</span>
          <span><strong>YUPI</strong><small>ADMINISTRATION</small></span>
        </Link>
        <nav className="admin-header-nav" aria-label="Administration">
          <Link className="admin-back-link" to="/admin/catalog"><ArrowLeft size={15} /> Catalogue</Link>
          {token && <button className="admin-logout" type="button" onClick={signOut}><LogOut size={15} /> Déconnexion</button>}
        </nav>
      </header>

      <main className="admin-main admin-orders-main">
        <div className="admin-title-row">
          <div>
            <p className="eyebrow"><span /> Suivi des ventes</p>
            <h1>Commandes</h1>
            <p className="admin-user">
              {user ? `${user.email} · ${user.role === 'super_admin' ? 'Super administrateur' : 'Administrateur'}` : 'Espace réservé aux administrateurs'}
            </p>
          </div>
          {user && (
            <button
              className="admin-logout"
              type="button"
              disabled={loading}
              onClick={() => setReloadKey((key) => key + 1)}
            >
              <RefreshCw size={15} /> Actualiser
            </button>
          )}
        </div>

        {error && (
          <div className="admin-message admin-message-error" role="alert">
            <span>{error}</span>
            {!token && <Link to="/admin/catalog">Se connecter à l’administration</Link>}
            {token && <button className="admin-retry" type="button" onClick={() => setReloadKey((key) => key + 1)}>Réessayer</button>}
          </div>
        )}

        {token && user && (
          <>
            <div className="admin-order-toolbar">
              <p><strong>{orders.length}</strong> commande{orders.length === 1 ? '' : 's'}</p>
              <label className="admin-order-filter">
                Filtrer par statut
                <select value={filter} onChange={(event) => setFilter(event.target.value)}>
                  <option value="all">Tous les statuts</option>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option value={value} key={value}>{label}</option>
                  ))}
                </select>
              </label>
            </div>

            {loading ? (
              <div className="admin-orders-state" role="status">
                <LoaderCircle className="loading-icon" size={25} aria-hidden="true" />
                <p>Chargement des commandes…</p>
              </div>
            ) : visibleOrders.length === 0 ? (
              <div className="admin-orders-state">
                <PackageCheck size={28} aria-hidden="true" />
                <h2>{orders.length === 0 ? 'Aucune commande pour le moment.' : 'Aucune commande pour ce statut.'}</h2>
                <p>Les nouvelles commandes apparaîtront ici après leur confirmation par les clients.</p>
              </div>
            ) : (
              <section className="admin-order-list" aria-label="Liste des commandes">
                {visibleOrders.map((order) => (
                  <article className="admin-order-card" key={order.id}>
                    <div className="admin-order-heading">
                      <div>
                        <p className="admin-order-reference">{order.order_number}</p>
                        <time dateTime={order.created_at}>
                          {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(order.created_at))}
                        </time>
                      </div>
                      <span className={`admin-order-status admin-order-status-${order.status}`}>
                        {statusLabels[order.status] || order.status}
                      </span>
                    </div>

                    <div className="admin-order-details">
                      <section>
                        <h2>Client</h2>
                        <p><strong>{order.customer_name}</strong></p>
                        <p><a href={`tel:${order.phone}`}>{order.phone}</a></p>
                        {order.email && <p><a href={`mailto:${order.email}`}>{order.email}</a></p>}
                      </section>
                      <section>
                        <h2>Livraison</h2>
                        <p>{order.neighborhood}, {order.city}</p>
                        <p>{order.delivery_landmark}</p>
                      </section>
                    </div>

                    <div className="admin-order-items">
                      {order.items.map((item, index) => (
                        <div className="admin-order-item" key={`${order.id}:${index}`}>
                          <img
                            className="admin-order-item-image"
                            src={item.image_url || '/yupi-hero.jpg'}
                            alt=""
                            loading="lazy"
                          />
                          <span className="admin-order-item-name">
                            <strong>{item.name}</strong>
                            <small>({item.kind === 'kit' ? 'Kit' : 'Produit'}) × {item.quantity}</small>
                          </span>
                          <strong className="admin-order-item-price">{formatAmount(item.unit_price)} × {item.quantity}</strong>
                        </div>
                      ))}
                    </div>

                    <div className="admin-order-total">
                      <span>Paiement à la livraison · {order.payment_method === 'cash_on_delivery' ? 'Espèces' : order.payment_method}</span>
                      <strong>Total : {formatAmount(order.total)}</strong>
                    </div>
                  </article>
                ))}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
