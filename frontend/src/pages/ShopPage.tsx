import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, LoaderCircle, Plus, ShoppingBag } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCart } from '../cart/CartContext'
import type { CartItemDraft, CartItemKind } from '../cart/CartContext'
import StoreHeader from '../components/StoreHeader'

interface Category {
  id: number
  name: string
  slug: string
  description: string | null
}

interface CatalogEntry {
  id: number
  slug: string
  name: string
  description: string | null
  price: string
  image_url: string | null
  category: Category
}

interface KitEntry extends CatalogEntry {
  items: { quantity: number; product: CatalogEntry }[]
}

interface CatalogResponse<T> {
  items: T[]
}

type ShopEntry = {
  kind: CartItemKind
  id: number
  slug: string
  name: string
  description: string | null
  price: number
  imageUrl: string | null
  category: Category
  productCount?: number
}

type LoadState = 'loading' | 'ready' | 'error'
type CatalogTab = 'all' | 'product' | 'kit'

function formatAmount(amount: number) {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function toCartDraft(item: ShopEntry): CartItemDraft {
  return {
    kind: item.kind,
    id: item.id,
    slug: item.slug,
    name: item.name,
    categoryName: item.category.name,
    price: item.price,
    imageUrl: item.imageUrl,
  }
}

export default function ShopPage() {
  const [state, setState] = useState<LoadState>('loading')
  const [categories, setCategories] = useState<Category[]>([])
  const [entries, setEntries] = useState<ShopEntry[]>([])
  const [tab, setTab] = useState<CatalogTab>('all')
  const [categorySlug, setCategorySlug] = useState('all')
  const [addedKey, setAddedKey] = useState('')
  const { addItem } = useCart()

  useEffect(() => {
    const controller = new AbortController()

    async function loadCatalog() {
      setState('loading')
      try {
        const [categoryResponse, productResponse, kitResponse] = await Promise.all([
          fetch('/api/catalog/categories', { signal: controller.signal }),
          fetch('/api/catalog/products', { signal: controller.signal }),
          fetch('/api/catalog/kits', { signal: controller.signal }),
        ])
        if (!categoryResponse.ok || !productResponse.ok || !kitResponse.ok) {
          throw new Error('Catalog request failed')
        }
        const [categoryData, productData, kitData] = await Promise.all([
          categoryResponse.json() as Promise<CatalogResponse<Category>>,
          productResponse.json() as Promise<CatalogResponse<CatalogEntry>>,
          kitResponse.json() as Promise<CatalogResponse<KitEntry>>,
        ])
        if (controller.signal.aborted) return
        const products: ShopEntry[] = productData.items.map((product) => ({
          kind: 'product',
          id: product.id,
          slug: product.slug,
          name: product.name,
          description: product.description,
          price: Number(product.price),
          imageUrl: product.image_url,
          category: product.category,
        }))
        const kits: ShopEntry[] = kitData.items.map((kit) => ({
          kind: 'kit',
          id: kit.id,
          slug: kit.slug,
          name: kit.name,
          description: kit.description,
          price: Number(kit.price),
          imageUrl: kit.image_url,
          category: kit.category,
          productCount: kit.items.length,
        }))
        setCategories(categoryData.items)
        setEntries([...kits, ...products].sort((left, right) => left.name.localeCompare(right.name, 'fr')))
        setState('ready')
      } catch {
        if (!controller.signal.aborted) setState('error')
      }
    }

    void loadCatalog()
    return () => controller.abort()
  }, [])

  const visibleEntries = useMemo(
    () => entries.filter((entry) =>
      (tab === 'all' || entry.kind === tab) &&
      (categorySlug === 'all' || entry.category.slug === categorySlug),
    ),
    [categorySlug, entries, tab],
  )

  function addToCart(entry: ShopEntry) {
    addItem(toCartDraft(entry))
    setAddedKey(`${entry.kind}:${entry.id}`)
  }

  return (
    <div className="store-page">
      <StoreHeader />
      <main className="shop-main">
        <div className="shop-heading">
          <div>
            <p className="eyebrow"><span /> La boutique Yupi</p>
            <h1>Choisissez à votre <em>rythme.</em></h1>
            <p className="shop-intro">Parcourez les produits et les kits disponibles dans notre catalogue.</p>
          </div>
          <Link className="shop-cart-summary" to="/panier">
            <ShoppingBag size={19} aria-hidden="true" /> Voir le panier <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>

        <div className="shop-toolbar">
          <div className="shop-tabs" role="group" aria-label="Type d’article">
            {([
              ['all', 'Tout'],
              ['kit', 'Kits'],
              ['product', 'Produits'],
            ] as const).map(([value, label]) => (
              <button
                className={tab === value ? 'shop-tab shop-tab-active' : 'shop-tab'}
                type="button"
                aria-pressed={tab === value}
                onClick={() => setTab(value)}
                key={value}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="category-filter">
            <span>Catégorie</span>
            <select value={categorySlug} onChange={(event) => setCategorySlug(event.target.value)}>
              <option value="all">Toutes les catégories</option>
              {categories.map((category) => (
                <option value={category.slug} key={category.id}>{category.name}</option>
              ))}
            </select>
          </label>
        </div>

        {state === 'loading' && (
          <div className="shop-state" role="status">
            <LoaderCircle className="loading-icon" size={27} aria-hidden="true" />
            <p>Chargement de la boutique…</p>
          </div>
        )}
        {state === 'error' && (
          <div className="shop-state shop-state-error" role="alert">
            <h2>La boutique est momentanément indisponible.</h2>
            <p>Le catalogue n’a pas pu être chargé. Réessayez dans un instant.</p>
            <button className="button button-primary" type="button" onClick={() => window.location.reload()}>
              Réessayer <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        )}
        {state === 'ready' && visibleEntries.length === 0 && (
          <div className="shop-state shop-empty">
            <span className="shop-empty-icon"><ShoppingBag size={23} aria-hidden="true" /></span>
            <h2>{entries.length === 0 ? 'Le catalogue se prépare.' : 'Aucun article dans cette sélection.'}</h2>
            <p>
              {entries.length === 0
                ? 'Les produits seront affichés ici dès leur publication par notre équipe.'
                : 'Essayez une autre catégorie ou consultez tous les articles.'}
            </p>
            {entries.length > 0 && (
              <button className="text-link" type="button" onClick={() => { setTab('all'); setCategorySlug('all') }}>
                Voir tous les articles <ArrowRight size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
        {state === 'ready' && visibleEntries.length > 0 && (
          <div className="shop-grid">
            {visibleEntries.map((entry) => {
              const itemKey = `${entry.kind}:${entry.id}`
              const detailPath = `/${entry.kind === 'kit' ? 'kits' : 'products'}/${entry.slug}`
              return (
                <article className="shop-card" key={itemKey}>
                  <Link className="shop-card-image" to={detailPath}>
                    <img
                      src={entry.imageUrl || '/yupi-hero.jpg'}
                      alt={entry.imageUrl ? entry.name : 'Feuillage vert, image illustrative'}
                      loading="lazy"
                    />
                    <span className="shop-card-kind">{entry.kind === 'kit' ? 'Kit' : 'Produit'}</span>
                  </Link>
                  <div className="shop-card-content">
                    <span className="shop-card-category">{entry.category.name}</span>
                    <h2><Link to={detailPath}>{entry.name}</Link></h2>
                    <p>{entry.description || (entry.kind === 'kit' ? `${entry.productCount ?? 0} produit${entry.productCount === 1 ? '' : 's'} dans ce kit.` : 'Découvrir les informations du produit.')}</p>
                    <div className="shop-card-bottom">
                      <strong>{formatAmount(entry.price)}</strong>
                      <button
                        className="shop-add-button"
                        type="button"
                        onClick={() => addToCart(entry)}
                        aria-label={`Ajouter ${entry.name} au panier`}
                      >
                        {addedKey === itemKey ? <Check size={17} /> : <Plus size={17} />}
                        <span>{addedKey === itemKey ? 'Ajouté' : 'Ajouter'}</span>
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}

        <p className="shop-payment-note">Paiement à la livraison. Les montants affichés sont ceux du catalogue.</p>
      </main>
    </div>
  )
}
