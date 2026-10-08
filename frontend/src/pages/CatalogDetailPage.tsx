import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CirclePlay,
  ExternalLink,
  LoaderCircle,
  Send,
  ShieldCheck,
  Star,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

interface Category {
  id: number
  name: string
  slug: string
  description: string | null
}

interface Product {
  id: number
  slug: string
  name: string
  description: string | null
  price: string
  image_url: string | null
  category: Category
}

interface Kit extends Product {
  items: { quantity: number; product: Product }[]
}

interface Review {
  id: number
  author_name: string
  rating: number
  body: string
  created_at: string
}

interface Testimonial {
  id: number
  author_name: string
  quote: string
  video_url: string | null
}

interface DetailData {
  item: Product | Kit
  reviews: Review[]
  testimonials: Testimonial[]
  averageRating: number | null
}

type LoadState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error' }
  | ({ status: 'ready' } & DetailData)

type CatalogKind = 'product' | 'kit'

function BrandMark() {
  return (
    <Link className="brand detail-brand" to="/#accueil" aria-label="Yupi Global, accueil">
      <span className="brand-symbol" aria-hidden="true">
        <span className="brand-leaf">Y</span>
      </span>
      <span className="brand-wordmark">
        <strong>YUPI</strong>
        <span>GLOBAL</span>
      </span>
    </Link>
  )
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <span className="rating-stars" aria-label={`Note ${rating} sur 5`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          size={15}
          fill={value <= rating ? 'currentColor' : 'none'}
          aria-hidden="true"
        />
      ))}
    </span>
  )
}

function ReviewForm({ kind, slug }: { kind: CatalogKind; slug: string }) {
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    setSubmitting(true)
    setMessage('')
    setMessageType('')

    try {
      const response = await fetch(`/api/catalog/${kind === 'product' ? 'products' : 'kits'}/${encodeURIComponent(slug)}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author_name: values.get('author_name'),
          rating: Number(values.get('rating')),
          body: values.get('body'),
        }),
      })
      if (response.status === 202) {
        form.reset()
        setMessage('Merci, votre avis sera visible après vérification.')
        setMessageType('success')
      } else if (response.status === 429) {
        setMessage('Le nombre d’envois autorisé est atteint. Réessayez plus tard.')
        setMessageType('error')
      } else {
        setMessage('Votre avis n’a pas pu être envoyé. Vérifiez les champs et réessayez.')
        setMessageType('error')
      }
    } catch {
      setMessage('Le service est momentanément indisponible. Réessayez plus tard.')
      setMessageType('error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="review-form" id="review-form" onSubmit={handleSubmit}>
      <div className="review-form-heading">
        <span className="detail-kicker">Votre expérience</span>
        <h3>Partager un avis</h3>
        <p>Les avis sont vérifiés avant publication.</p>
      </div>
      <label>
        Votre nom
        <input name="author_name" type="text" autoComplete="name" maxLength={160} required />
      </label>
      <label>
        Votre note
        <select name="rating" defaultValue="5" required>
          <option value="5">5 étoiles</option>
          <option value="4">4 étoiles</option>
          <option value="3">3 étoiles</option>
          <option value="2">2 étoiles</option>
          <option value="1">1 étoile</option>
        </select>
      </label>
      <label>
        Votre avis
        <textarea name="body" rows={4} maxLength={5000} required />
      </label>
      <button className="button button-primary review-submit" type="submit" disabled={submitting}>
        {submitting ? <LoaderCircle className="loading-icon" size={17} /> : <Send size={16} />}
        {submitting ? 'Envoi en cours' : 'Envoyer pour vérification'}
      </button>
      {message && <p className={`form-message form-message-${messageType}`} role="status">{message}</p>}
    </form>
  )
}

export default function CatalogDetailPage({ kind }: { kind: CatalogKind }) {
  const { slug = '' } = useParams()
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()

    async function loadDetails() {
      setState({ status: 'loading' })
      const segment = kind === 'product' ? 'products' : 'kits'
      try {
        const detailResponse = await fetch(
          `/api/catalog/${segment}/${encodeURIComponent(slug)}`,
          { signal: controller.signal },
        )
        if (detailResponse.status === 404) {
          setState({ status: 'not-found' })
          return
        }
        if (!detailResponse.ok) throw new Error('Catalog request failed')
        const detailResult: { item: Product | Kit } = await detailResponse.json()
        const [reviewResponse, testimonialResponse] = await Promise.all([
          fetch(`/api/catalog/${segment}/${encodeURIComponent(slug)}/reviews`, { signal: controller.signal }),
          fetch(`/api/catalog/testimonials?${kind}=${encodeURIComponent(slug)}`, { signal: controller.signal }),
        ])
        const reviewResult = reviewResponse.ok
          ? await reviewResponse.json() as { items: Review[]; average_rating: number | null }
          : { items: [], average_rating: null }
        const testimonialResult = testimonialResponse.ok
          ? await testimonialResponse.json() as { items: Testimonial[] }
          : { items: [] }
        if (!controller.signal.aborted) {
          setState({
            status: 'ready',
            item: detailResult.item,
            reviews: reviewResult.items,
            averageRating: reviewResult.average_rating,
            testimonials: testimonialResult.items,
          })
        }
      } catch {
        if (!controller.signal.aborted) setState({ status: 'error' })
      }
    }

    void loadDetails()
    return () => controller.abort()
  }, [kind, slug])

  return (
    <div className="detail-page">
      <header className="site-header detail-site-header">
        <div className="header-inner detail-header-inner">
          <BrandMark />
          <Link className="detail-back-link" to="/#kits">
            <ArrowLeft size={16} aria-hidden="true" /> Nos kits
          </Link>
        </div>
      </header>

      {state.status === 'loading' && (
        <main className="detail-state" aria-live="polite">
          <LoaderCircle className="loading-icon" size={28} aria-hidden="true" />
          <p>Chargement de la fiche…</p>
        </main>
      )}
      {state.status === 'not-found' && (
        <main className="detail-state">
          <span className="detail-kicker">Yupi Global</span>
          <h1>{kind === 'kit' ? 'Ce kit n’est pas encore publié.' : 'Ce produit n’est pas encore publié.'}</h1>
          <p>Revenez bientôt pour découvrir les informations validées par notre équipe.</p>
          <Link className="button button-primary" to="/#kits">
            Retour aux kits <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </main>
      )}
      {state.status === 'error' && (
        <main className="detail-state">
          <span className="detail-kicker">Yupi Global</span>
          <h1>Fiche momentanément indisponible.</h1>
          <p>Le catalogue n’a pas pu être chargé. Réessayez dans un instant.</p>
          <Link className="button button-primary" to="/#kits">
            Retour aux kits <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </main>
      )}
      {state.status === 'ready' && (
        <main className="detail-main">
          <nav className="detail-breadcrumb" aria-label="Fil d’Ariane">
            <Link to="/#accueil">Accueil</Link>
            <span aria-hidden="true">/</span>
            <Link to="/#kits">Nos kits</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{state.item.name}</span>
          </nav>

          <section className="detail-overview" aria-labelledby="detail-title">
            <div className="detail-image-wrap">
              <img
                className="detail-image"
                src={state.item.image_url || '/yupi-hero.jpg'}
                alt={state.item.image_url ? state.item.name : 'Feuillage vert, image illustrative'}
              />
              <span className="detail-image-caption">Yupi Global · {state.item.category.name}</span>
            </div>
            <div className="detail-information">
              <span className="detail-kicker">{state.item.category.name}</span>
              <h1 id="detail-title">{state.item.name}</h1>
              <p className="detail-description">
                {state.item.description || 'La description détaillée de ce produit sera bientôt disponible.'}
              </p>
              <div className="detail-price">
                <span>Prix catalogue</span>
                <strong>{new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(state.item.price))}</strong>
              </div>
              <p className="detail-payment">Paiement à la livraison.</p>
              <a className="button button-primary detail-review-cta" href="#review-form">
                Donner mon avis <ArrowRight size={16} aria-hidden="true" />
              </a>
              <p className="detail-health-note">
                <ShieldCheck size={16} aria-hidden="true" />
                Ne remplace pas un avis médical.
              </p>
            </div>
          </section>

          {kind === 'kit' && 'items' in state.item && (
            <section className="kit-contents" aria-labelledby="kit-contents-title">
              <div className="detail-section-heading">
                <span className="detail-kicker">Composition du kit</span>
                <h2 id="kit-contents-title">Les produits inclus</h2>
              </div>
              <div className="kit-product-list">
                {state.item.items.map(({ product, quantity }) => (
                  <Link className="kit-product-row" to={`/products/${product.slug}`} key={product.id}>
                    <span className="kit-product-quantity">{String(quantity).padStart(2, '0')}</span>
                    <span className="kit-product-name">{product.name}</span>
                    <span className="kit-product-category">{product.category.name}</span>
                    <ArrowRight size={17} aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </section>
          )}

          {state.testimonials.length > 0 && (
            <section className="detail-testimonials" aria-labelledby="detail-testimonials-title">
              <div className="detail-section-heading">
                <span className="detail-kicker">Paroles partagées</span>
                <h2 id="detail-testimonials-title">Témoignages</h2>
              </div>
              <div className="detail-testimonial-grid">
                {state.testimonials.map((testimonial) => (
                  <article className="detail-testimonial" key={testimonial.id}>
                    <p>« {testimonial.quote} »</p>
                    <div className="detail-testimonial-author">
                      <span>{testimonial.author_name}</span>
                      {testimonial.video_url && (
                        <a href={testimonial.video_url} target="_blank" rel="noreferrer">
                          <CirclePlay size={16} aria-hidden="true" /> Voir la vidéo
                          <ExternalLink size={13} aria-hidden="true" />
                        </a>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="detail-reviews" id="reviews" aria-labelledby="reviews-title">
            <div className="detail-section-heading">
              <span className="detail-kicker">Avis publiés</span>
              <h2 id="reviews-title">Les expériences partagées</h2>
              {state.averageRating !== null && (
                <p className="average-rating">
                  <RatingStars rating={Math.round(state.averageRating)} />
                  <strong>{state.averageRating.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}</strong>
                  <span>sur {state.reviews.length} avis publié{state.reviews.length > 1 ? 's' : ''}</span>
                </p>
              )}
            </div>
            {state.reviews.length > 0 ? (
              <div className="review-list">
                {state.reviews.map((review) => (
                  <article className="review-item" key={review.id}>
                    <div className="review-item-heading">
                      <strong>{review.author_name}</strong>
                      <RatingStars rating={review.rating} />
                    </div>
                    <p>{review.body}</p>
                    <time dateTime={review.created_at}>
                      {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(review.created_at))}
                    </time>
                  </article>
                ))}
              </div>
            ) : (
              <p className="review-empty">Aucun avis publié pour le moment. Votre expérience pourra aider les prochains visiteurs.</p>
            )}
            <ReviewForm kind={kind} slug={slug} />
          </section>
        </main>
      )}

      <footer className="detail-footer">
        <Link to="/#accueil">Yupi Global</Link>
        <span>Le bien-être, plus proche.</span>
        <Link to="/#kits">Retour aux kits</Link>
      </footer>
    </div>
  )
}

export function NotFoundPage() {
  return (
    <main className="detail-state">
      <span className="detail-kicker">Yupi Global</span>
      <h1>Cette page n’existe pas.</h1>
      <p>Découvrez nos familles de produits et de kits.</p>
      <Link className="button button-primary" to="/#kits">
        Retour à l’accueil <ArrowRight size={17} aria-hidden="true" />
      </Link>
    </main>
  )
}
