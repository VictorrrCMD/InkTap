import { CheckCircle, WarningCircle } from '@phosphor-icons/react'
import { useEffect } from 'react'
import { uid } from '../lib/bytes'
import { createStore, useStore } from '../lib/store'

export interface Toast {
  id: string
  tone: 'success' | 'error' | 'info'
  text: string
  action?: { label: string; run: () => void }
}

const toasts = createStore<{ list: Toast[] }>({ list: [] })

export function toast(text: string, options: Partial<Omit<Toast, 'id' | 'text'>> = {}) {
  const item: Toast = { id: uid('t_'), tone: options.tone ?? 'info', text, action: options.action }
  toasts.set((s) => ({ list: [...s.list.slice(-2), item] }))
  return item.id
}

export function dismiss(id: string) {
  toasts.set((s) => ({ list: s.list.filter((t) => t.id !== id) }))
}

function ToastRow({ item }: { item: Toast }) {
  useEffect(() => {
    const ms = item.action ? 7000 : item.tone === 'error' ? 8000 : 4000
    const timer = setTimeout(() => dismiss(item.id), ms)
    return () => clearTimeout(timer)
  }, [item])

  const Icon = item.tone === 'error' ? WarningCircle : item.tone === 'success' ? CheckCircle : null
  return (
    <div className="toast" data-tone={item.tone} role={item.tone === 'error' ? 'alert' : 'status'}>
      {Icon ? <Icon size={18} weight="fill" className="toast__icon" aria-hidden /> : null}
      <span className="toast__text">{item.text}</span>
      {item.action ? (
        <button
          type="button"
          className="toast__action"
          onClick={() => {
            item.action?.run()
            dismiss(item.id)
          }}
        >
          {item.action.label}
        </button>
      ) : null}
    </div>
  )
}

export function Toasts() {
  const list = useStore(toasts, (s) => s.list)
  return (
    <div className="toasts" aria-live="polite">
      {list.map((item) => (
        <ToastRow key={item.id} item={item} />
      ))}
    </div>
  )
}
