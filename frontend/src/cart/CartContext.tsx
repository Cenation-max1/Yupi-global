import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

export type CartItemKind = 'product' | 'kit'

export interface CartItemDraft {
  kind: CartItemKind
  id: number
  slug: string
  name: string
  categoryName: string
  price: number
  imageUrl: string | null
}

export interface CartItem extends CartItemDraft {
  key: string
  quantity: number
}

interface CartContextValue {
  items: CartItem[]
  itemCount: number
  subtotal: number
  addItem: (item: CartItemDraft, quantity?: number) => void
  setQuantity: (key: string, quantity: number) => void
  removeItem: (key: string) => void
  clearCart: () => void
}

const storageKey = 'yupi-global-cart-v1'
const CartContext = createContext<CartContextValue | null>(null)

function isCartItem(value: unknown): value is CartItem {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Partial<CartItem>
  return (
    (item.kind === 'product' || item.kind === 'kit') &&
    Number.isInteger(item.id) &&
    typeof item.slug === 'string' &&
    typeof item.name === 'string' &&
    typeof item.categoryName === 'string' &&
    typeof item.price === 'number' &&
    Number.isFinite(item.price) &&
    item.price >= 0 &&
    (item.imageUrl === null || typeof item.imageUrl === 'string') &&
    typeof item.key === 'string' &&
    Number.isInteger(item.quantity) &&
    Number(item.quantity) >= 1 &&
    Number(item.quantity) <= 99
  )
}

function readCart(): CartItem[] {
  try {
    const stored = window.localStorage.getItem(storageKey)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed.filter(isCartItem) : []
  } catch {
    return []
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(readCart)

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(items))
    } catch {
      // Keep the in-memory cart usable when browser storage is unavailable.
    }
  }, [items])

  const itemCount = items.reduce((total, item) => total + item.quantity, 0)
  const subtotal = items.reduce((total, item) => total + item.price * item.quantity, 0)

  function addItem(draft: CartItemDraft, quantity = 1) {
    if (!Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(draft.price) || draft.price < 0) return
    const key = `${draft.kind}:${draft.id}`
    setItems((current) => {
      const existing = current.find((item) => item.key === key)
      if (existing) {
        return current.map((item) =>
          item.key === key
            ? { ...item, quantity: Math.min(99, item.quantity + quantity) }
            : item,
        )
      }
      return [...current, { ...draft, key, quantity: Math.min(99, quantity) }]
    })
  }

  function setQuantity(key: string, quantity: number) {
    if (!Number.isInteger(quantity)) return
    if (quantity < 1) {
      removeItem(key)
      return
    }
    setItems((current) =>
      current.map((item) => item.key === key ? { ...item, quantity: Math.min(99, quantity) } : item),
    )
  }

  function removeItem(key: string) {
    setItems((current) => current.filter((item) => item.key !== key))
  }

  function clearCart() {
    setItems([])
  }

  return (
    <CartContext.Provider value={{ items, itemCount, subtotal, addItem, setQuantity, removeItem, clearCart }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart must be used within CartProvider.')
  return context
}
