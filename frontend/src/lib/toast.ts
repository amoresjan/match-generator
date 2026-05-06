import { useState, useEffect } from 'react'

export type ToastVariant = 'default' | 'destructive'

export interface ToastItem {
  id: string
  title: string
  variant: ToastVariant
}

let _items: ToastItem[] = []
const _listeners = new Set<React.Dispatch<React.SetStateAction<ToastItem[]>>>()

function _notify() {
  const snap = [..._items]
  _listeners.forEach((l) => l(snap))
}

function _remove(id: string) {
  _items = _items.filter((t) => t.id !== id)
  _notify()
}

function _add(title: string, variant: ToastVariant) {
  const id = crypto.randomUUID()
  _items = [..._items, { id, title, variant }]
  _notify()
  setTimeout(() => _remove(id), 4000)
}

export const toast = Object.assign(
  (title: string) => _add(title, 'default'),
  {
    success: (title: string) => _add(title, 'default'),
    error: (title: string) => _add(title, 'destructive'),
  },
)

export function useToastStore() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    _listeners.add(setItems)
    return () => { _listeners.delete(setItems) }
  }, [])

  return { items, dismiss: _remove }
}
