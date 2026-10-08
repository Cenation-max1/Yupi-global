import { useEffect, useState } from 'react'
import { CirclePlay, ExternalLink } from 'lucide-react'

interface Testimonial {
  id: number
  author_name: string
  quote: string
  video_url: string | null
}

export default function TestimonialsPreview() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([])

  useEffect(() => {
    const controller = new AbortController()

    async function loadTestimonials() {
      try {
        const response = await fetch('/api/catalog/testimonials', {
          signal: controller.signal,
        })
        if (!response.ok) return
        const result: { items: Testimonial[] } = await response.json()
        setTestimonials(result.items)
      } catch {
        if (!controller.signal.aborted) setTestimonials([])
      }
    }

    void loadTestimonials()
    return () => controller.abort()
  }, [])

  if (testimonials.length === 0) {
    return (
      <div className="voices-content testimonial-empty">
        <div className="video-placeholder" aria-label="Témoignages vidéo à venir">
          <span className="video-mark"><CirclePlay size={34} strokeWidth={1.4} aria-hidden="true" /></span>
          <span>Témoignages vidéo</span>
          <span className="video-status">À venir</span>
        </div>
        <div className="voices-copy">
          <span className="quote-mark" aria-hidden="true">“</span>
          <h3>La confiance commence par une parole sincère.</h3>
          <p>
            Les témoignages seront publiés avec l’accord de leurs auteurs. Aucun retour client n’est affiché sans validation.
          </p>
          <div className="review-status">
            <span className="review-dot" aria-hidden="true" />
            <span>Les premiers avis arrivent bientôt</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="testimonial-feed">
      {testimonials.map((testimonial) => (
        <article className="testimonial-card" key={testimonial.id}>
          {testimonial.video_url && (
            <a
              className="testimonial-video"
              href={testimonial.video_url}
              target="_blank"
              rel="noreferrer"
              aria-label={`Regarder le témoignage vidéo de ${testimonial.author_name}`}
            >
              <CirclePlay size={38} strokeWidth={1.5} aria-hidden="true" />
              <span>Voir la vidéo <ExternalLink size={14} aria-hidden="true" /></span>
            </a>
          )}
          <blockquote>« {testimonial.quote} »</blockquote>
          <p className="testimonial-author">{testimonial.author_name}</p>
        </article>
      ))}
    </div>
  )
}
