import { useState } from 'react'
import {
  ArrowDownRight,
  ArrowRight,
  Flower2,
  HeartHandshake,
  Leaf,
  Menu,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Truck,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import TestimonialsPreview from './components/TestimonialsPreview'

const navigation = [
  { label: 'Accueil', href: '#accueil' },
  { label: 'Nos kits', href: '#kits' },
  { label: 'Notre approche', href: '#approche' },
  { label: 'Avis clients', href: '#temoignages' },
]

const kitFamilies: {
  name: string
  slug: string
  number: string
  description: string
  icon: LucideIcon
  tone: string
}[] = [
  {
    name: 'Myomes',
    slug: 'kit-myomes',
    number: '01',
    description: 'Une famille de produits réunis dans un kit dédié.',
    icon: Flower2,
    tone: 'peach',
  },
  {
    name: 'Fertilité',
    slug: 'kit-fertilite',
    number: '02',
    description: 'Plusieurs produits sélectionnés dans un même kit.',
    icon: HeartHandshake,
    tone: 'green',
  },
  {
    name: 'Kystes',
    slug: 'kit-kystes',
    number: '03',
    description: 'Une sélection à découvrir dans son détail produit.',
    icon: Sparkles,
    tone: 'yellow',
  },
  {
    name: 'Détox',
    slug: 'kit-detox',
    number: '04',
    description: 'Des produits rassemblés au sein d’un même kit.',
    icon: Leaf,
    tone: 'blue',
  },
]

const commitments = [
  {
    number: '01',
    title: 'Des informations claires',
    description:
      'Chaque produit mérite une présentation simple, avec sa composition et ses conseils d’utilisation.',
  },
  {
    number: '02',
    title: 'Le temps de bien choisir',
    description:
      'Découvrez les familles de produits et prenez le temps de trouver celles qui vous correspondent.',
  },
  {
    number: '03',
    title: 'Le paiement à la livraison',
    description:
      'Votre commande se règle à sa réception, selon les modalités convenues avec notre équipe.',
  },
]

function Brand({ light = false }: { light?: boolean }) {
  return (
    <a className={`brand${light ? ' brand-light' : ''}`} href="#accueil" aria-label="Yupi Global, accueil">
      <span className="brand-symbol" aria-hidden="true">
        <Leaf size={20} strokeWidth={2.2} />
      </span>
      <span className="brand-wordmark">
        <strong>YUPI</strong>
        <span>GLOBAL</span>
      </span>
    </a>
  )
}

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false)

  function closeMenu() {
    setMenuOpen(false)
  }

  return (
    <>
      <a className="skip-link" href="#contenu">Aller au contenu</a>

      <div className="announcement">
        <span className="announcement-dot" aria-hidden="true" />
        <span>Paiement à la livraison</span>
        <span className="announcement-divider" aria-hidden="true" />
        <span>À votre rythme, en toute simplicité</span>
      </div>

      <header className="site-header">
        <div className="header-inner">
          <Brand />
          <button
            className="menu-toggle"
            type="button"
            aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={menuOpen}
            aria-controls="main-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <nav
            className={`main-navigation${menuOpen ? ' navigation-open' : ''}`}
            id="main-navigation"
            aria-label="Navigation principale"
          >
            {navigation.map((item) => (
              <a key={item.href} href={item.href} onClick={closeMenu}>
                {item.label}
              </a>
            ))}
            <a className="header-cta" href="#kits" onClick={closeMenu}>
              Explorer les kits <ArrowRight size={16} aria-hidden="true" />
            </a>
          </nav>
        </div>
      </header>

      <main id="contenu">
        <section className="hero" id="accueil" aria-labelledby="hero-title">
          <img
            className="hero-image"
            src="/yupi-hero.jpg"
            alt="Jeune plante aux feuilles vertes, symbole de croissance et de renouveau"
            fetchPriority="high"
          />
          <div className="hero-inner">
            <div className="hero-copy">
              <p className="eyebrow"><span /> Le bien-être, plus proche</p>
              <h1 id="hero-title">Yupi Global</h1>
              <p className="hero-lead">
                Des produits et des kits pensés pour vous accompagner, avec une approche claire et humaine.
              </p>
              <div className="hero-actions">
                <a className="button button-primary" href="#kits">
                  Découvrir nos kits <ArrowRight size={18} aria-hidden="true" />
                </a>
                <a className="text-link" href="#approche">
                  Notre approche <ArrowDownRight size={17} aria-hidden="true" />
                </a>
              </div>
              <p className="hero-note">
                <ShieldCheck size={16} aria-hidden="true" />
                Des choix personnels, des informations essentielles.
              </p>
            </div>
            <span className="hero-caption">Prendre soin de soi, à son rythme.</span>
          </div>
          <a className="hero-scroll" href="#kits" aria-label="Faire défiler vers les kits">
            <span />
          </a>
        </section>

        <section className="service-strip" aria-label="Nos engagements de service">
          <div className="service-item">
            <span className="service-icon"><PackageCheck size={20} aria-hidden="true" /></span>
            <span><strong>Des kits thématiques</strong><small>Plusieurs produits réunis</small></span>
          </div>
          <span className="service-rule" aria-hidden="true" />
          <div className="service-item">
            <span className="service-icon service-icon-coral"><Truck size={20} aria-hidden="true" /></span>
            <span><strong>Livraison organisée</strong><small>Selon votre lieu de réception</small></span>
          </div>
          <span className="service-rule" aria-hidden="true" />
          <div className="service-item">
            <span className="service-icon service-icon-yellow"><HeartHandshake size={20} aria-hidden="true" /></span>
            <span><strong>Un échange humain</strong><small>Avant de confirmer votre choix</small></span>
          </div>
        </section>

        <section className="kits-section section-pad" id="kits" aria-labelledby="kits-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow"><span /> Les univers Yupi</p>
              <h2 id="kits-title">Des besoins différents. <em>Des kits dédiés.</em></h2>
            </div>
            <p className="section-intro">
              Explorez les familles de kits imaginées autour des besoins que vous nous avez partagés.
            </p>
          </div>
          <div className="kit-grid">
            {kitFamilies.map(({ name, slug, number, description, icon: Icon, tone }) => (
              <article className="kit-card" key={name}>
                <div className={`kit-art kit-art-${tone}`}>
                  <span className="kit-number">{number}</span>
                  <Icon className="kit-icon" size={38} strokeWidth={1.5} aria-hidden="true" />
                  <span className="kit-label">KIT YUPI</span>
                </div>
                <div className="kit-copy">
                  <h3>{name}</h3>
                  <p>{description}</p>
                  <span className="kit-type">Famille de produits</span>
                  <Link className="kit-detail-link" to={`/kits/${slug}`}>
                    Voir la fiche <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
          <p className="catalog-note">
            <ShieldCheck size={17} aria-hidden="true" />
            Les informations détaillées seront présentées pour chaque produit et chaque composition de kit.
          </p>
        </section>

        <section className="approach-section" id="approche" aria-labelledby="approach-title">
          <div className="approach-inner">
            <div className="approach-heading">
              <p className="eyebrow eyebrow-light"><span /> Notre engagement</p>
              <h2 id="approach-title">Le choix vous appartient. <em>La clarté nous engage.</em></h2>
              <p>
                Le bien-être est personnel. Notre rôle est de vous présenter nos produits avec soin, sans promesse irréaliste.
              </p>
              <a className="button button-light" href="#temoignages">
                En savoir plus <ArrowRight size={17} aria-hidden="true" />
              </a>
            </div>
            <div className="commitment-list">
              {commitments.map((item) => (
                <article className="commitment" key={item.number}>
                  <span className="commitment-number">{item.number}</span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                  </div>
                  <ArrowDownRight className="commitment-arrow" size={21} aria-hidden="true" />
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="voices-section section-pad" id="temoignages" aria-labelledby="voices-title">
          <div className="voices-heading">
            <p className="eyebrow"><span /> Paroles partagées</p>
            <h2 id="voices-title">Chaque expérience est <em>personnelle.</em></h2>
          </div>
          <TestimonialsPreview />
        </section>

        <section className="health-note" aria-label="Information santé">
          <ShieldCheck size={21} aria-hidden="true" />
          <p>
            Les produits proposés ne remplacent pas un avis médical, un diagnostic ou un traitement prescrit par un professionnel de santé.
          </p>
        </section>
      </main>

      <footer className="site-footer" id="contact">
        <div className="footer-main">
          <div className="footer-brand-block">
            <Brand light />
            <p>Le bien-être, plus proche.</p>
          </div>
          <div className="footer-links">
            <span>Explorer</span>
            <a href="#kits">Nos kits</a>
            <a href="#approche">Notre approche</a>
            <a href="#temoignages">Avis clients</a>
          </div>
          <a className="footer-top" href="#accueil" aria-label="Retour en haut de page">
            <ArrowRight size={19} aria-hidden="true" />
          </a>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Yupi Global</span>
          <span>Prendre soin de soi, à son rythme.</span>
        </div>
      </footer>
    </>
  )
}