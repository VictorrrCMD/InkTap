import { ArrowsOutCardinal, Check, Minus, Plus, Trash, X } from '@phosphor-icons/react'
import { INK_COLORS } from '../pdf/model'
import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { MARK_PATHS } from '../pdf/marks'
import type { Item, PageInfo } from '../pdf/model'
import { SignatureArt } from '../sign/SignatureArt'
import { toast } from '../ui/toast'
import { commitItems, patchItem, removeItem, undo, useDoc, useDocStore, type DocStore } from './doc'
import { LINE_HEIGHT } from './place'

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), Math.max(min, max))

interface Props {
  item: Item
  zoom: number
  page: PageInfo
  sheet: boolean
  onEditText: (item: Item) => void
}

function describe(item: Item): string {
  if (item.type === 'signature') return 'Firma'
  if (item.type === 'mark') return item.mark === 'check' ? 'Marca de verificación' : 'Marca equis'
  return item.text ? `Texto: ${item.text}` : 'Texto vacío'
}

export function deleteWithUndo(store: DocStore, id: string) {
  removeItem(store, id)
  toast('Elemento eliminado', { action: { label: 'Deshacer', run: () => undo(store) } })
}

export const ItemView = memo(function ItemView({ item, zoom, page, sheet, onEditText }: Props) {
  const store = useDocStore()
  const selected = useDoc((s) => s.selected === item.id)
  const editing = useDoc((s) => s.editing === item.id)
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })

  // Text has no stored size: measure what the browser drew, in page points.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setBox({ w: el.offsetWidth / zoom, h: el.offsetHeight / zoom })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [zoom])

  useEffect(() => {
    const el = ref.current
    if (selected && !editing && el && !el.contains(document.activeElement)) el.focus({ preventScroll: true })
  }, [selected, editing])

  // A new item is born selected; if it landed under the dock or the top bar,
  // bring it (and its toolbar) into view.
  useEffect(() => {
    if (store.get().selected === item.id) ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [store, item.id])

  const size = () => {
    if (item.type === 'signature') return { w: item.w, h: item.h }
    if (item.type === 'mark') return { w: item.size, h: item.size }
    return box
  }

  const startDrag = (e: ReactPointerEvent<HTMLElement>) => {
    if (editing || (e.pointerType === 'mouse' && e.button !== 0)) return
    e.stopPropagation()
    const wasSelected = store.get().selected === item.id
    store.set({ selected: item.id, editing: null })
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const start = { px: e.clientX, py: e.clientY, x: item.x, y: item.y }
    const before = store.get().items
    const { w, h } = size()
    let moved = false

    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.px) / zoom
      const dy = (ev.clientY - start.py) / zoom
      if (!moved && Math.hypot(dx, dy) * zoom < 4) return
      moved = true
      patchItem(store, item.id, {
        x: clamp(start.x + dx, 0, page.width - w),
        y: clamp(start.y + dy, 0, page.height - h),
      })
    }
    const onUp = () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      if (moved) commitItems(store, store.get().items, before)
      else if (wasSelected && item.type === 'text') edit()
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
  }

  // Drag the corner and the item scales as one: the projection of the drag
  // onto the box's diagonal sets the factor.
  const startResize = (e: ReactPointerEvent<HTMLSpanElement>) => {
    e.stopPropagation()
    e.preventDefault()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const start = { px: e.clientX, py: e.clientY }
    const origin = { ...item } as Item
    const { w, h } = size()
    const before = store.get().items
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.px) / zoom
      const dy = (ev.clientY - start.py) / zoom
      const factor = 1 + (dx * w + dy * h) / (w * w + h * h)
      if (origin.type === 'signature') {
        const maxW = Math.min(page.width - origin.x, (page.height - origin.y) * (origin.w / origin.h))
        const nw = clamp(origin.w * factor, 24, maxW)
        patchItem(store, item.id, { w: nw, h: nw * (origin.h / origin.w) })
      } else if (origin.type === 'text') {
        patchItem(store, item.id, { size: clamp(Math.round(origin.size * factor * 2) / 2, 6, 48) })
      } else {
        patchItem(store, item.id, { size: clamp(origin.size * factor, 6, 60) })
      }
    }
    const onUp = () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      commitItems(store, store.get().items, before)
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
  }

  const edit = () => {
    if (item.type !== 'text') return
    if (sheet) onEditText(item)
    else store.set({ selected: item.id, editing: item.id })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (editing) return
    const step = e.shiftKey ? 10 : 1
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    if (moves[e.key]) {
      e.preventDefault()
      const [dx, dy] = moves[e.key]
      const { w, h } = size()
      const before = store.get().items
      patchItem(store, item.id, { x: clamp(item.x + dx, 0, page.width - w), y: clamp(item.y + dy, 0, page.height - h) })
      commitItems(store, store.get().items, before)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      deleteWithUndo(store, item.id)
    } else if (e.key === 'Enter' && item.type === 'text') {
      e.preventDefault()
      edit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      store.set({ selected: null })
      ref.current?.blur()
    }
  }

  const shown = size()
  const small = Math.min(shown.w || 99, shown.h || 99) * zoom < 30

  const style: CSSProperties = { left: item.x * zoom, top: item.y * zoom }
  if (item.type === 'signature') Object.assign(style, { width: item.w * zoom, height: item.h * zoom })
  if (item.type === 'mark') Object.assign(style, { width: item.size * zoom, height: item.size * zoom })

  return (
    <div
      ref={ref}
      className="item"
      data-type={item.type}
      data-small={small || undefined}
      data-selected={selected || undefined}
      data-editing={editing || undefined}
      style={style}
      tabIndex={0}
      role="group"
      aria-label={describe(item)}
      aria-describedby="item-help"
      onPointerDown={startDrag}
      onDoubleClick={edit}
      onKeyDown={onKeyDown}
      onFocus={(e) => {
        if (e.target === e.currentTarget && store.get().selected !== item.id) store.set({ selected: item.id })
      }}
    >
      {item.type === 'signature' ? <SignatureArt signature={item.signature} className="item__sig" /> : null}
      {item.type === 'mark' ? (
        <svg viewBox="0 0 256 256" className="item__mark" aria-hidden>
          <path d={MARK_PATHS[item.mark]} fill={item.color} />
        </svg>
      ) : null}
      {item.type === 'text' ? <TextBody item={item} zoom={zoom} editing={editing} /> : null}

      {selected && !editing ? (
        <>
          <span className="item__handle" onPointerDown={startResize} aria-hidden />
          {small ? (
            // Too small to grab without covering it: a grip outside the item.
            <span className="item__grip" onPointerDown={startDrag} title="Arrastra para mover" aria-hidden>
              <ArrowsOutCardinal size={14} weight="bold" />
            </span>
          ) : null}
          <ItemToolbar item={item} flip={item.y * zoom < 52} />
        </>
      ) : null}
    </div>
  )
})

function TextBody({ item, zoom, editing }: { item: Extract<Item, { type: 'text' }>; zoom: number; editing: boolean }) {
  const store = useDocStore()
  const before = useRef<Item[] | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const style = { fontSize: item.size * zoom, color: item.color, lineHeight: LINE_HEIGHT }

  useEffect(() => {
    if (!editing) return
    before.current = store.get().items
    const el = area.current
    if (el) {
      el.focus({ preventScroll: true })
      el.setSelectionRange(el.value.length, el.value.length)
    }
  }, [editing, store])

  const finish = () => {
    const state = store.get()
    const current = state.items.find((i) => i.id === item.id)
    store.set({ editing: null })
    if (!current || current.type !== 'text') return
    if (!current.text.trim()) {
      // Never typed into: leave no trace, not even an undo step.
      const snapshot = before.current ?? state.items
      const wasThere = snapshot.some((i) => i.id === item.id && i.type === 'text' && i.text.trim())
      store.set((s) => ({
        items: s.items.filter((i) => i.id !== item.id),
        undo: wasThere ? [...s.undo, snapshot] : s.undo.slice(0, -1),
        selected: null,
      }))
      return
    }
    if (before.current && current.text !== (before.current.find((i) => i.id === item.id) as typeof current | undefined)?.text) {
      commitItems(store, state.items, before.current)
    }
  }

  if (!editing) {
    return (
      <div className="item__text doc-font" style={style}>
        {item.text || ' '}
      </div>
    )
  }
  return (
    <div className="autosize doc-font" data-value={item.text + ' '} style={style}>
      <textarea
        ref={area}
        rows={1}
        value={item.text}
        aria-label="Texto"
        spellCheck={false}
        onPointerDown={(e) => e.stopPropagation()}
        onChange={(e) => patchItem(store, item.id, { text: e.target.value })}
        onBlur={finish}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Escape') {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }}
      />
    </div>
  )
}

function ItemToolbar({ item, flip }: { item: Item; flip: boolean }) {
  const store = useDocStore()
  const resize = (delta: number) => {
    if (item.type !== 'text') return
    const before = store.get().items
    patchItem(store, item.id, { size: clamp(item.size + delta, 6, 48) })
    commitItems(store, store.get().items, before)
  }
  return (
    <div className="item-bar" data-flip={flip || undefined} role="toolbar" aria-label="Opciones del elemento" onPointerDown={(e) => e.stopPropagation()}>
      {item.type === 'text' ? (
        <>
          <button type="button" className="item-bar__btn" onClick={() => resize(-1)} aria-label="Letra más chica" title="Letra más chica">
            <Minus size={16} weight="bold" aria-hidden />
          </button>
          <span className="item-bar__value" aria-live="polite">
            {item.size} pt
          </span>
          <button type="button" className="item-bar__btn" onClick={() => resize(1)} aria-label="Letra más grande" title="Letra más grande">
            <Plus size={16} weight="bold" aria-hidden />
          </button>
          <span className="item-bar__sep" aria-hidden />
        </>
      ) : null}
      {item.type === 'mark' ? (
        <>
          <button
            type="button"
            className="item-bar__btn"
            aria-pressed={item.mark === 'check'}
            aria-label="Palomita"
            title="Palomita"
            onClick={() => {
              const before = store.get().items
              patchItem(store, item.id, { mark: 'check' })
              commitItems(store, store.get().items, before)
            }}
          >
            <Check size={16} weight="bold" aria-hidden />
          </button>
          <button
            type="button"
            className="item-bar__btn"
            aria-pressed={item.mark === 'cross'}
            aria-label="Equis"
            title="Equis"
            onClick={() => {
              const before = store.get().items
              patchItem(store, item.id, { mark: 'cross' })
              commitItems(store, store.get().items, before)
            }}
          >
            <X size={16} weight="bold" aria-hidden />
          </button>
          <span className="item-bar__sep" aria-hidden />
        </>
      ) : null}
      {item.type !== 'signature' || item.signature.kind === 'ink' ? (
        <>
          <ColorChoice
            value={item.type === 'signature' ? item.signature.color : item.color}
            onChange={(color) => {
              const before = store.get().items
              const current = before.find((i) => i.id === item.id)
              if (!current) return
              if (current.type === 'signature') patchItem(store, item.id, { signature: { ...current.signature, color } })
              else patchItem(store, item.id, { color })
              commitItems(store, store.get().items, before)
            }}
          />
          <span className="item-bar__sep" aria-hidden />
        </>
      ) : null}
      <button type="button" className="item-bar__btn item-bar__btn--danger" onClick={() => deleteWithUndo(store, item.id)} aria-label="Eliminar" title="Eliminar">
        <Trash size={16} weight="bold" aria-hidden />
      </button>
    </div>
  )
}

// Blue, black, or any color from the system picker.
function ColorChoice({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const custom = useRef<HTMLInputElement>(null)
  const isPreset = value === INK_COLORS.blue || value === INK_COLORS.black
  return (
    <span className="item-bar__colors" role="group" aria-label="Color">
      {(['blue', 'black'] as const).map((key) => (
        <button
          key={key}
          type="button"
          className="item-bar__btn"
          aria-pressed={value === INK_COLORS[key]}
          aria-label={key === 'blue' ? 'Tinta azul' : 'Tinta negra'}
          title={key === 'blue' ? 'Azul' : 'Negra'}
          onClick={() => onChange(INK_COLORS[key])}
        >
          <span className="item-bar__swatch" style={{ background: INK_COLORS[key] }} aria-hidden />
        </button>
      ))}
      <button
        type="button"
        className="item-bar__btn"
        aria-pressed={!isPreset}
        aria-label="Otro color"
        title="Otro color"
        onClick={() => {
          try {
            custom.current?.showPicker()
          } catch {
            custom.current?.click()
          }
        }}
      >
        <span className="item-bar__swatch item-bar__swatch--custom" style={{ background: isPreset ? undefined : value }} aria-hidden />
      </button>
      <input ref={custom} type="color" className="ink-picker__native" value={value} onChange={(e) => onChange(e.target.value)} tabIndex={-1} aria-hidden />
    </span>
  )
}
