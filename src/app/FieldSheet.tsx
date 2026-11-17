import { useEffect, useId, useRef } from 'react'
import type { Field, Item } from '../pdf/model'
import { commitItems, patchItem, setValue, useDoc, useDocStore } from './doc'
import { fieldLabel } from './FieldControl'

export type SheetTarget = { kind: 'field'; field: Field } | { kind: 'item'; itemId: string }

interface Props {
  target: SheetTarget
  onDone: () => void
  onNext?: () => void
}

// Phones edit text in a bar pinned above the keyboard, at 16px so iOS doesn't
// zoom the page; the PDF behind it updates as you type.
export function FieldSheet({ target, onDone, onNext }: Props) {
  const store = useDocStore()
  const id = useId()
  const bar = useRef<HTMLFormElement>(null)
  const input = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const before = useRef<Item[] | null>(null)

  const value = useDoc((s) => {
    if (target.kind === 'field') return s.values[target.field.name] ?? ''
    const item = s.items.find((i) => i.id === target.itemId)
    return item?.type === 'text' ? item.text : ''
  })
  const label = target.kind === 'field' ? fieldLabel(target.field) : 'Texto'
  const multiline = target.kind === 'field' ? Boolean(target.field.multiline) : false
  const maxLength = target.kind === 'field' ? target.field.maxLen : undefined

  useEffect(() => {
    if (target.kind === 'item') before.current = store.get().items
    input.current?.focus({ preventScroll: true })
    const selector = target.kind === 'field' ? `[data-field-id="${CSS.escape(target.field.id)}"]` : null
    const el = selector ? document.querySelector(selector) : null
    el?.scrollIntoView({ block: 'center' })
  }, [target, store])

  // Ride on top of the on-screen keyboard: the visual viewport shrinks, the
  // layout viewport doesn't, so lift the bar by the difference.
  useEffect(() => {
    const vv = window.visualViewport
    const el = bar.current
    if (!vv || !el) return
    const update = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop
      el.style.transform = covered > 0 ? `translateY(${-covered}px)` : ''
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  const change = (text: string) => {
    if (target.kind === 'field') setValue(store, target.field.name, text)
    else patchItem(store, target.itemId, { text })
  }

  const close = () => {
    if (target.kind === 'item') {
      const state = store.get()
      const item = state.items.find((i) => i.id === target.itemId)
      if (item?.type === 'text' && !item.text.trim()) {
        store.set((s) => ({ items: s.items.filter((i) => i.id !== target.itemId), undo: s.undo.slice(0, -1), selected: null }))
      } else if (before.current) commitItems(store, state.items, before.current)
    }
    onDone()
  }

  const Control = multiline ? 'textarea' : 'input'
  return (
    <form
      ref={bar}
      className="field-sheet"
      onSubmit={(e) => {
        e.preventDefault()
        if (onNext) onNext()
        else close()
      }}
    >
      <label htmlFor={id} className="field-sheet__label">
        {label}
      </label>
      <div className="field-sheet__row">
        <Control
          id={id}
          ref={input}
          className="text-input field-sheet__input"
          value={value}
          maxLength={maxLength}
          rows={multiline ? 3 : undefined}
          enterKeyHint={onNext ? 'next' : 'done'}
          autoComplete="off"
          onChange={(e: { target: { value: string } }) => change(e.target.value)}
        />
      </div>
      <div className="field-sheet__actions">
        {onNext ? (
          <button type="submit" className="btn btn-outline">
            Siguiente
          </button>
        ) : null}
        <button type="button" className="btn btn-primary" onClick={close}>
          Listo
        </button>
      </div>
    </form>
  )
}
