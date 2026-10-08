import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import { ArrowLeft, Check, ClipboardList, LoaderCircle, LogOut, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'

interface Category {
  id: number
  name: string
  slug: string
  description: string | null
  is_active: boolean
}

interface Product {
  id: number
  sku: string
  slug: string
  name: string
  description: string | null
  price: string
  stock_quantity: number
  image_url: string | null
  is_active: boolean
  category: Pick<Category, 'id' | 'name' | 'slug' | 'description'>
}

interface Kit extends Omit<Product, 'stock_quantity'> {
  items: { quantity: number; product: Product }[]
}

interface AdminCatalog {
  categories: Category[]
  products: Product[]
  kits: Kit[]
}

interface AdminUser {
  email: string
  role: 'admin' | 'super_admin'
}

type CatalogTab = 'categories' | 'products' | 'kits'
type AuthState = 'checking' | 'signed-out' | 'signed-in'
type EditTarget = { kind: CatalogTab; id: number } | null

const sessionKey = 'yupi-global-admin-token'

async function adminRequest<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(path, { ...init, headers })
  let result: unknown
  if (response.status !== 204) {
    result = await response.json()
  }
  if (!response.ok) {
    const message =
      typeof result === 'object' && result !== null && 'error' in result &&
      typeof result.error === 'string'
        ? result.error
        : 'La requête a échoué. Réessayez.'
    const failure = Object.assign(new Error(message), { status: response.status })
    throw failure
  }
  return result as T
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : 'Une erreur inattendue est survenue.'
}

export default function AdminCatalogPage() {
  const [token, setToken] = useState(() => window.sessionStorage.getItem(sessionKey) || '')
  const [authState, setAuthState] = useState<AuthState>(
    () => window.sessionStorage.getItem(sessionKey) ? 'checking' : 'signed-out',
  )
  const [user, setUser] = useState<AdminUser | null>(null)
  const [catalog, setCatalog] = useState<AdminCatalog>({ categories: [], products: [], kits: [] })
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogAttempt, setCatalogAttempt] = useState(0)
  const [formVersion, setFormVersion] = useState(0)
  const [tab, setTab] = useState<CatalogTab>('products')
  const [editing, setEditing] = useState<EditTarget>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    adminRequest<{ user: AdminUser }>('/api/auth/me', token)
      .then(({ user: currentUser }) => {
        if (!cancelled) {
          if (currentUser.role !== 'admin' && currentUser.role !== 'super_admin') {
            signOut()
            setError('Ce compte ne dispose pas des droits d’administration.')
            return
          }
          setUser(currentUser)
          setAuthState('signed-in')
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          signOut()
          setError(describeError(reason))
        }
      })
    return () => { cancelled = true }
  }, [token])

  useEffect(() => {
    if (authState !== 'signed-in' || !token) return
    let cancelled = false
    setCatalogLoading(true)
    setError('')
    Promise.all([
      adminRequest<{ items: Category[] }>('/api/admin/catalog/categories', token),
      adminRequest<{ items: Product[] }>('/api/admin/catalog/products', token),
      adminRequest<{ items: Kit[] }>('/api/admin/catalog/kits', token),
    ])
      .then(([categories, products, kits]) => {
        if (!cancelled) setCatalog({
          categories: categories.items,
          products: products.items,
          kits: kits.items,
        })
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(describeError(reason))
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false)
      })
    return () => { cancelled = true }
  }, [authState, token, catalogAttempt])

  function signOut() {
    window.sessionStorage.removeItem(sessionKey)
    setToken('')
    setUser(null)
    setAuthState('signed-out')
    setCatalog({ categories: [], products: [], kits: [] })
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: values.get('email'),
          password: values.get('password'),
        }),
      })
      const result: { access_token?: string; user?: AdminUser; error?: string } = await response.json()
      if (!response.ok || !result.access_token || !result.user) {
        throw new Error(result.error || 'Connexion impossible. Vérifiez vos identifiants.')
      }
      if (result.user.role !== 'admin' && result.user.role !== 'super_admin') {
        throw new Error('Ce compte ne dispose pas des droits d’administration.')
      }
      window.sessionStorage.setItem(sessionKey, result.access_token)
      setUser(result.user)
      setToken(result.access_token)
      setAuthState('signed-in')
      setNotice('')
    } catch (reason) {
      setError(describeError(reason))
    } finally {
      setBusy(false)
    }
  }

  async function refreshCatalog() {
    const [categories, products, kits] = await Promise.all([
      adminRequest<{ items: Category[] }>('/api/admin/catalog/categories', token),
      adminRequest<{ items: Product[] }>('/api/admin/catalog/products', token),
      adminRequest<{ items: Kit[] }>('/api/admin/catalog/kits', token),
    ])
    setCatalog({
      categories: categories.items,
      products: products.items,
      kits: kits.items,
    })
  }

  async function uploadAdminImage(file: File) {
    const body = new FormData()
    body.append('image', file)
    const response = await fetch('/api/admin/uploads/images', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body,
    })
    const result: { image_url?: string; error?: string } = await response.json()
    if (!response.ok || !result.image_url) {
      throw new Error(result.error || 'L’image n’a pas pu être envoyée.')
    }
    return result.image_url
  }

  function handleApiError(reason: unknown) {
    setError(describeError(reason))
    if (typeof reason === 'object' && reason !== null && 'status' in reason && reason.status === 401) {
      signOut()
    }
  }

  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const imageFile = values.get('image_file')
      let imageUrl: string | null = values.has('remove_image')
        ? null
        : String(values.get('image_url') || '') || null
      if (imageFile instanceof File && imageFile.size > 0) {
        imageUrl = await uploadAdminImage(imageFile)
      }

      const method = editing ? 'PATCH' : 'POST'
      const entryId = editing?.id
      const basePath = `/api/admin/catalog/${tab}`
      let payload: Record<string, unknown>

      if (tab === 'categories') {
        payload = {
          name: values.get('name'),
          slug: values.get('slug'),
          description: values.get('description') || null,
          ...(editing ? { is_active: values.has('is_active') } : {}),
        }
      } else if (tab === 'products') {
        payload = {
          category_id: Number(values.get('category_id')),
          sku: values.get('sku'),
          slug: values.get('slug'),
          name: values.get('name'),
          description: values.get('description') || null,
          price: values.get('price'),
          stock_quantity: Number(values.get('stock_quantity')),
          image_url: imageUrl,
          ...(editing ? { is_active: values.has('is_active') } : {}),
        }
      } else {
        const selectedIds = values.getAll('product_ids').map(Number)
        payload = {
          category_id: Number(values.get('category_id')),
          sku: values.get('sku'),
          slug: values.get('slug'),
          name: values.get('name'),
          description: values.get('description') || null,
          price: values.get('price'),
          image_url: imageUrl,
          items: selectedIds.map((productId) => ({
            product_id: productId,
            quantity: Number(values.get(`quantity_${productId}`) || 1),
          })),
          ...(editing ? { is_active: values.has('is_active') } : {}),
        }
      }

      await adminRequest(`${basePath}${entryId ? `/${entryId}` : ''}`, token, {
        method,
        body: JSON.stringify(payload),
      })
      await refreshCatalog()
      setEditing(null)
      setFormVersion((version) => version + 1)
      setNotice(editing ? 'Modifications enregistrées.' : 'Entrée créée.')
    } catch (reason) {
      handleApiError(reason)
    } finally {
      setBusy(false)
    }
  }

  async function deactivateEntry(id: number) {
    if (!window.confirm('Désactiver cette entrée du catalogue ?')) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await adminRequest(`/api/admin/catalog/${tab}/${id}`, token, { method: 'DELETE' })
      await refreshCatalog()
      setNotice('Entrée désactivée.')
    } catch (reason) {
      handleApiError(reason)
    } finally {
      setBusy(false)
    }
  }

  const currentCategories = catalog.categories
  const currentProducts = catalog.products
  const currentKits = catalog.kits

  return (
    <div className="admin-page">
      <header className="admin-header">
        <Link className="admin-brand" to="/">
          <span className="admin-brand-mark">Y</span>
          <span><strong>YUPI</strong><small>ADMINISTRATION</small></span>
        </Link>
        <nav className="admin-header-nav" aria-label="Administration">
          <Link className="admin-back-link" to="/admin/orders"><ClipboardList size={15} /> Commandes</Link>
          <Link className="admin-back-link" to="/"><ArrowLeft size={15} /> Retour à la boutique</Link>
        </nav>
      </header>

      {authState === 'checking' && (
        <main className="admin-auth-state" role="status">
          <LoaderCircle className="loading-icon" size={26} aria-hidden="true" />
          <p>Vérification de votre session…</p>
        </main>
      )}

      {authState === 'signed-out' && (
        <main className="admin-login-wrap">
          <form className="admin-login" onSubmit={handleLogin}>
            <ShieldCheck size={25} aria-hidden="true" />
            <p className="eyebrow"><span /> Espace sécurisé</p>
            <h1>Administration</h1>
            <p className="admin-login-intro">Connectez-vous avec un compte administrateur pour gérer le catalogue.</p>
            <label>
              Adresse e-mail
              <input name="email" type="email" autoComplete="username" maxLength={255} required />
            </label>
            <label>
              Mot de passe
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            {error && <p className="form-message form-message-error" role="alert">{error}</p>}
            <button className="button button-primary" type="submit" disabled={busy}>
              {busy ? <LoaderCircle className="loading-icon" size={17} /> : <ShieldCheck size={17} />}
              {busy ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>
        </main>
      )}

      {authState === 'signed-in' && user && (
        <main className="admin-main">
          <div className="admin-title-row">
            <div>
              <p className="eyebrow"><span /> Catalogue Yupi Global</p>
              <h1>Gestion du catalogue</h1>
              <p className="admin-user">{user.email} · {user.role === 'super_admin' ? 'Super administrateur' : 'Administrateur'}</p>
            </div>
            <button className="admin-logout" type="button" onClick={signOut}><LogOut size={16} /> Déconnexion</button>
          </div>

          <div className="admin-tabs" role="tablist" aria-label="Types de contenus du catalogue">
            {([
              ['categories', 'Catégories'],
              ['products', 'Produits'],
              ['kits', 'Kits'],
            ] as const).map(([value, label]) => (
              <button
                id={`admin-tab-${value}`}
                key={value}
                className={tab === value ? 'admin-tab admin-tab-active' : 'admin-tab'}
                type="button"
                role="tab"
                aria-selected={tab === value}
                aria-controls="admin-panel"
                onClick={() => { setTab(value); setEditing(null); setError(''); setNotice('') }}
              >
                {label}
                <span>{catalog[value].length}</span>
              </button>
            ))}
          </div>

          {error && (
            <div className="admin-message admin-message-error" role="alert">
              <span>{error}</span>
              {!catalogLoading && (
                <button className="admin-retry" type="button" onClick={() => { setError(''); setCatalogAttempt((attempt) => attempt + 1) }}>
                  Recharger le catalogue
                </button>
              )}
            </div>
          )}
          {notice && <p className="admin-message admin-message-success" role="status"><Check size={15} />{notice}</p>}

          <section className="admin-workspace" id="admin-panel" role="tabpanel" aria-labelledby={`admin-tab-${tab}`}>
            <div className="admin-list-panel">
              <div className="admin-panel-heading">
                <h2>{tab === 'categories' ? 'Catégories' : tab === 'products' ? 'Produits' : 'Kits'}</h2>
                <button className="button button-primary admin-create" type="button" onClick={() => setEditing(null)}>
                  <Plus size={16} /> Ajouter
                </button>
              </div>
              {catalogLoading ? (
                <div className="admin-auth-state" role="status"><LoaderCircle className="loading-icon" size={23} />Chargement du catalogue…</div>
              ) : (
                <div className="admin-table-wrap">
                  {tab === 'categories' && (
                    <table className="admin-table">
                      <thead><tr><th>Nom</th><th>Slug</th><th>État</th><th>Actions</th></tr></thead>
                      <tbody>
                        {currentCategories.map((category) => (
                          <tr key={category.id}>
                            <td>{category.name}</td><td>{category.slug}</td>
                            <td><span className={category.is_active ? 'admin-status' : 'admin-status admin-status-off'}>{category.is_active ? 'Active' : 'Inactive'}</span></td>
                            <td><AdminActions onEdit={() => setEditing({ kind: 'categories', id: category.id })} onDelete={() => void deactivateEntry(category.id)} disabled={busy || !category.is_active} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {tab === 'products' && (
                    <table className="admin-table">
                      <thead><tr><th>Produit</th><th>Catégorie</th><th>Prix</th><th>Stock</th><th>État</th><th>Actions</th></tr></thead>
                      <tbody>
                        {currentProducts.map((product) => (
                          <tr key={product.id}>
                            <td><strong>{product.name}</strong><small>{product.sku} · {product.slug}</small></td>
                            <td>{product.category.name}</td><td>{product.price}</td><td>{product.stock_quantity}</td>
                            <td><span className={product.is_active ? 'admin-status' : 'admin-status admin-status-off'}>{product.is_active ? 'Actif' : 'Inactif'}</span></td>
                            <td><AdminActions onEdit={() => setEditing({ kind: 'products', id: product.id })} onDelete={() => void deactivateEntry(product.id)} disabled={busy || !product.is_active} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {tab === 'kits' && (
                    <table className="admin-table">
                      <thead><tr><th>Kit</th><th>Catégorie</th><th>Produits</th><th>Prix</th><th>État</th><th>Actions</th></tr></thead>
                      <tbody>
                        {currentKits.map((kit) => (
                          <tr key={kit.id}>
                            <td><strong>{kit.name}</strong><small>{kit.sku} · {kit.slug}</small></td>
                            <td>{kit.category.name}</td><td>{kit.items.length}</td><td>{kit.price}</td>
                            <td><span className={kit.is_active ? 'admin-status' : 'admin-status admin-status-off'}>{kit.is_active ? 'Actif' : 'Inactif'}</span></td>
                            <td><AdminActions onEdit={() => setEditing({ kind: 'kits', id: kit.id })} onDelete={() => void deactivateEntry(kit.id)} disabled={busy || !kit.is_active} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {!catalog[tab].length && <p className="admin-empty">Aucune entrée. Utilisez « Ajouter » pour commencer.</p>}
                </div>
              )}
            </div>

            <AdminEntryForm
              tab={tab}
              editing={editing?.kind === tab ? editing : null}
              categories={currentCategories}
              products={currentProducts}
              kits={currentKits}
              formVersion={formVersion}
              busy={busy}
              onSubmit={saveEntry}
              onCancel={() => setEditing(null)}
            />
          </section>
        </main>
      )}
    </div>
  )
}

function AdminActions({ onEdit, onDelete, disabled }: { onEdit: () => void; onDelete: () => void; disabled: boolean }) {
  return (
    <span className="admin-actions">
      <button type="button" aria-label="Modifier" title="Modifier" onClick={onEdit}><Pencil size={15} /></button>
      <button type="button" aria-label="Désactiver" title="Désactiver" onClick={onDelete} disabled={disabled}><Trash2 size={15} /></button>
    </span>
  )
}

function AdminEntryForm({
  tab,
  editing,
  categories,
  products,
  kits,
  formVersion,
  busy,
  onSubmit,
  onCancel,
}: {
  tab: CatalogTab
  editing: EditTarget
  categories: Category[]
  products: Product[]
  kits: Kit[]
  formVersion: number
  busy: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onCancel: () => void
}) {
  const category = editing?.kind === 'categories'
    ? categories.find((entry) => entry.id === editing.id) ??
      ({ id: 0, name: '', slug: '', description: null, is_active: true } satisfies Category)
    : null
  const product = editing?.kind === 'products'
    ? products.find((entry) => entry.id === editing.id) ?? null
    : null
  const kit = editing?.kind === 'kits'
    ? kits.find((entry) => entry.id === editing.id) ?? null
    : null
  const title = editing ? 'Modifier une entrée' : tab === 'categories' ? 'Nouvelle catégorie' : tab === 'products' ? 'Nouveau produit' : 'Nouveau kit'

  return (
    <form className="admin-entry-form" onSubmit={onSubmit} key={`${tab}:${editing?.id ?? 'new'}:${formVersion}`}>
      <div className="admin-form-heading">
        <h2>{title}</h2>
        {editing && <button className="admin-cancel" type="button" onClick={onCancel}>Annuler</button>}
      </div>
      {tab === 'categories' && (
        <>
          <AdminField label="Nom" name="name" defaultValue={category?.name} maxLength={120} required />
          <AdminField label="Slug" name="slug" defaultValue={category?.slug} maxLength={160} required />
          <AdminField label="Description" name="description" defaultValue={category?.description || ''} multiline />
          {category && <AdminActiveToggle active={category.is_active} />}
        </>
      )}
      {tab === 'products' && (
        <>
          <AdminSelect label="Catégorie" name="category_id" defaultValue={product?.category.id} required>
            {categories.filter((entry) => entry.is_active).map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}
          </AdminSelect>
          <AdminField label="Nom" name="name" defaultValue={product?.name} maxLength={180} required />
          <AdminField label="SKU" name="sku" defaultValue={product?.sku} maxLength={60} required />
          <AdminField label="Slug" name="slug" defaultValue={product?.slug} maxLength={160} required />
          <AdminField label="Description" name="description" defaultValue={product?.description || ''} multiline />
          <AdminField label="Prix" name="price" defaultValue={product?.price} inputMode="decimal" required />
          <AdminField label="Stock" name="stock_quantity" defaultValue={product?.stock_quantity ?? 0} inputMode="numeric" required />
          <AdminImageField initialUrl={product?.image_url || null} />
          {product && <AdminActiveToggle active={product.is_active} />}
        </>
      )}
      {tab === 'kits' && (
        <>
          <AdminSelect label="Catégorie" name="category_id" defaultValue={kit?.category.id} required>
            {categories.filter((entry) => entry.is_active).map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}
          </AdminSelect>
          <AdminField label="Nom" name="name" defaultValue={kit?.name} maxLength={180} required />
          <AdminField label="SKU" name="sku" defaultValue={kit?.sku} maxLength={60} required />
          <AdminField label="Slug" name="slug" defaultValue={kit?.slug} maxLength={160} required />
          <AdminField label="Description" name="description" defaultValue={kit?.description || ''} multiline />
          <AdminField label="Prix" name="price" defaultValue={kit?.price} inputMode="decimal" required />
          <AdminImageField initialUrl={kit?.image_url || null} />
          <fieldset className="admin-kit-products">
            <legend>Produits du kit</legend>
            {!products.some((entry) => entry.is_active) && <p className="admin-empty">Aucun produit actif à ajouter.</p>}
            {products.filter((entry) => entry.is_active).map((entry) => {
              const quantity = kit?.items.find((item) => item.product.id === entry.id)?.quantity ?? 1
              return (
                <label className="admin-kit-product" key={entry.id}>
                  <input type="checkbox" name="product_ids" value={entry.id} defaultChecked={quantity !== 1 || kit?.items.some((item) => item.product.id === entry.id)} />
                  <span>{entry.name}</span>
                  <input aria-label={`Quantité de ${entry.name}`} type="number" name={`quantity_${entry.id}`} min="1" step="1" defaultValue={quantity} />
                </label>
              )
            })}
          </fieldset>
          {kit && <AdminActiveToggle active={kit.is_active} />}
        </>
      )}
      <button className="button button-primary admin-save" type="submit" disabled={busy}>
        {busy ? <LoaderCircle className="loading-icon" size={16} /> : <Check size={16} />}
        {busy ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Créer'}
      </button>
    </form>
  )
}

function AdminActiveToggle({ active }: { active: boolean }) {
  return (
    <label className="admin-active-toggle">
      <input type="checkbox" name="is_active" defaultChecked={active} />
      <span>Entrée active dans le catalogue</span>
    </label>
  )
}

function AdminImageField({ initialUrl }: { initialUrl: string | null }) {
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const removeInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!file) {
      setPreviewUrl('')
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.currentTarget.files?.[0] ?? null)
    if (removeInput.current) removeInput.current.checked = false
  }

  return (
    <div className="admin-image-field">
      <span className="admin-image-label">Image du catalogue</span>
      <input type="hidden" name="image_url" value={initialUrl || ''} readOnly />
      <div className="admin-image-picker">
        {(previewUrl || initialUrl) && (
          <img src={previewUrl || initialUrl || ''} alt="Aperçu de l’image du catalogue" />
        )}
        <label className="admin-file-picker">
          <span>{file ? 'Choisir une autre image' : initialUrl ? 'Remplacer l’image' : 'Choisir une image'}</span>
          <input
            name="image_file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={chooseFile}
          />
        </label>
      </div>
      <p className="admin-image-help">JPEG, PNG ou WebP · 5 Mo maximum</p>
      {initialUrl && (
        <label className="admin-remove-image">
          <input ref={removeInput} type="checkbox" name="remove_image" />
          <span>Retirer l’image actuelle</span>
        </label>
      )}
    </div>
  )
}

function AdminField({
  label,
  name,
  defaultValue,
  maxLength,
  required,
  multiline,
  inputMode,
}: {
  label: string
  name: string
  defaultValue?: string | number
  maxLength?: number
  required?: boolean
  multiline?: boolean
  inputMode?: 'decimal' | 'numeric'
}) {
  return (
    <label className="admin-field">
      {label}
      {multiline
        ? <textarea name={name} rows={3} defaultValue={defaultValue} maxLength={5000} />
        : <input name={name} type="text" defaultValue={defaultValue} maxLength={maxLength} inputMode={inputMode} required={required} />}
    </label>
  )
}

function AdminSelect({
  label,
  name,
  defaultValue,
  required,
  children,
}: {
  label: string
  name: string
  defaultValue?: number
  required?: boolean
  children: ReactNode
}) {
  return (
    <label className="admin-field">
      {label}
      <select name={name} defaultValue={defaultValue} required={required}>
        <option value="">Choisir…</option>
        {children}
      </select>
    </label>
  )
}
