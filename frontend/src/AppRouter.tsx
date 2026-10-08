import { useLayoutEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import HomePage from './App'
import AdminCatalogPage from './pages/AdminCatalogPage'
import AdminOrdersPage from './pages/AdminOrdersPage'
import CartPage from './pages/CartPage'
import CatalogDetailPage, { NotFoundPage } from './pages/CatalogDetailPage'
import ShopPage from './pages/ShopPage'

function ScrollToHash() {
  const { hash, pathname } = useLocation()

  useLayoutEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0)
      return
    }

    const target = document.getElementById(decodeURIComponent(hash.slice(1)))
    if (!target) return

    const root = document.documentElement
    const previousScrollBehavior = root.style.scrollBehavior
    const headerHeight = document.querySelector('.site-header')?.getBoundingClientRect().height ?? 0
    const top = window.scrollY + target.getBoundingClientRect().top - headerHeight - 8
    root.style.scrollBehavior = 'auto'
    window.scrollTo(0, Math.max(0, top))
    root.style.scrollBehavior = previousScrollBehavior
  }, [hash, pathname])

  return null
}

export default function AppRouter() {
  return (
    <>
      <ScrollToHash />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/boutique" element={<ShopPage />} />
        <Route path="/panier" element={<CartPage />} />
        <Route path="/admin/catalog" element={<AdminCatalogPage />} />
        <Route path="/admin/orders" element={<AdminOrdersPage />} />
        <Route path="/products/:slug" element={<CatalogDetailPage kind="product" />} />
        <Route path="/kits/:slug" element={<CatalogDetailPage kind="kit" />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  )
}
