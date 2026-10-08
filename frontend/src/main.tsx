import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/dm-sans'
import '@fontsource/fraunces/400.css'
import '@fontsource/fraunces/500.css'
import { BrowserRouter } from 'react-router-dom'
import AppRouter from './AppRouter'
import { CartProvider } from './cart/CartContext'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <CartProvider>
        <AppRouter />
      </CartProvider>
    </BrowserRouter>
  </StrictMode>,
)