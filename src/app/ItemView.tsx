import { ArrowArcLeft, ArrowArcRight, ArrowClockwise, ArrowsOutCardinal, Check, Copy, DownloadSimple, Minus, Plus, Trash, X } from '@phosphor-icons/react'
import { INK_COLORS, type SignatureItem } from '../pdf/model'
import { normalizeAngle, turnedSize, turnPoint } from '../pdf/turn'
import { signatureFile, type SignatureFormat } from '../sign/signatureFile'
import { saveBlob } from './download'
import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { MARK_PATHS } from '../pdf/marks'
import type { Item, PageInfo } from '../pdf/model'
import { SignatureArt } from '../sign/SignatureArt'
import { toast } from '../ui/toast'
import { commitItems, patchItem, useDoc, useDocStore } from './doc'
import { LINE_HEIGHT } from './place'
import { clamp, copySelection, deleteSelection, gesture, moveSelection, offsetItems, rotationOf, textBoxes, turnSelection, within } from './selection'

// After a resize, the corner that was dragged from stays where it shows.
function keepCorner(x: number, y: number, w: number, h: number, nw: number, nh: number, deg: number) {
  if (!deg) return { x, y }
  const [px, py] = turnPoint(x, y, x + w / 2, y + h / 2, deg)
  const [qx, qy] = turnPoint(0, 0, nw / 2, nh / 2, deg)
  return { x: px - qx, y: py - qy }
}

// Near a right angle, land on it.
function snapAngle(deg: number, fine: boolean) {
  if (fine) return Math.round(deg / 15) * 15
  const near = Math.round(deg / 90) * 90
  return Math.abs(deg - near) < 4 ? near : deg
}

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

export const ItemView = memo(function ItemView({ item, zoom, page, sheet, onEditText }: Props) {
  const store = useDocStore()
  const selected = useDoc((s) => s.selected.includes(item.id))
  // The last one picked carries the toolbar; handles only show when it is alone.
  const primary = useDoc((s) => s.selected[s.selected.length - 1] === item.id)
  const count = useDoc((s) => s.selected.length)
  const editing = useDoc((s) => s.editing === item.id)
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })

  // Text has no stored size: measure what the browser drew, in page points.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const next = { w: el.offsetWidth / zoom, h: el.offsetHeight / zoom }
      if (item.type === 'text') textBoxes.set(item.id, next)
      setBox(next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [zoom, item.id, item.type])

  useEffect(() => {
    const el = ref.current
    if (primary && !editing && el && !el.contains(document.activeElement)) el.focus({ preventScroll: true })
  }, [primary, editing])

  // A new item is born selected; if it landed under the dock or the top bar,
  // bring it (and its toolbar) into view.
  useEffect(() => {
    if (store.get().selected.includes(item.id)) ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [store, item.id])

  const size = () => {
    if (item.type === 'signature') return { w: item.w, h: item.h }
    if (item.type === 'mark') return { w: item.size, h: item.size }
    return box
  }

  // Shift, Ctrl or Cmd adds to the selection or takes the item out of it;
  // dragging any selected item moves the whole selection.
  const startDrag = (e: ReactPointerEvent<HTMLElement>) => {
    if (editing || gesture.pinching || (e.pointerType === 'mouse' && e.button !== 0)) return
    e.stopPropagation()
    const state = store.get()
    const additive = e.shiftKey || e.ctrlKey || e.metaKey
    const wasSelected = state.selected.includes(item.id)
    if (additive && wasSelected) {
      store.set({ selected: state.selected.filter((id) => id !== item.id), editing: null })
      return
    }
    if (additive) store.set({ selected: [...state.selected, item.id], editing: null })
    else if (!wasSelected) store.set({ selected: [item.id], editing: null })
    else store.set({ editing: null })
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const start = { px: e.clientX, py: e.clientY }
    const before = store.get().items
    const group = before.filter((i) => store.get().selected.includes(i.id))
    let moved = false

    const onMove = (ev: PointerEvent) => {
      if (gesture.pinching) {
        // A second finger came down to zoom: put everything back and let go.
        if (moved) store.set({ items: before })
        moved = false
        onUp()
        return
      }
      const dx = (ev.clientX - start.px) / zoom
      const dy = (ev.clientY - start.py) / zoom
      if (!moved && Math.hypot(dx, dy) * zoom < 4) return
      moved = true
      offsetItems(store, group, dx, dy)
    }
    const onUp = () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      if (moved) commitItems(store, store.get().items, before)
      else if (additive || gesture.pinching) return
      else if (wasSelected && group.length > 1) store.set({ selected: [item.id] })
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
    const deg = rotationOf(origin)
    const r = (deg * Math.PI) / 180
    const before = store.get().items
    const onMove = (ev: PointerEvent) => {
      // The drag, measured along the item's own (turned) axes.
      const mx = (ev.clientX - start.px) / zoom
      const my = (ev.clientY - start.py) / zoom
      const dx = mx * Math.cos(r) + my * Math.sin(r)
      const dy = -mx * Math.sin(r) + my * Math.cos(r)
      const factor = 1 + (dx * w + dy * h) / (w * w + h * h)
      if (origin.type === 'signature') {
        const maxW = deg ? page.width : Math.min(page.width - origin.x, (page.height - origin.y) * (origin.w / origin.h))
        const nw = clamp(origin.w * factor, 24, maxW)
        const nh = nw * (origin.h / origin.w)
        patchItem(store, item.id, { w: nw, h: nh, ...keepCorner(origin.x, origin.y, w, h, nw, nh, deg) })
      } else {
        const size = origin.type === 'text' ? clamp(Math.round(origin.size * factor * 2) / 2, 6, 48) : clamp(origin.size * factor, 6, 60)
        const k = size / origin.size
        patchItem(store, item.id, { size, ...keepCorner(origin.x, origin.y, w, h, w * k, h * k, deg) })
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

  // Drag the round handle around the item's center to turn it.
  const startTurn = (e: ReactPointerEvent<HTMLSpanElement>) => {
    e.stopPropagation()
    e.preventDefault()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const from = Math.atan2(e.clientY - cy, e.clientX - cx)
    const startDeg = rotationOf(item)
    const { w, h } = size()
    const before = store.get().items
    const onMove = (ev: PointerEvent) => {
      const turned = startDeg + ((Math.atan2(ev.clientY - cy, ev.clientX - cx) - from) * 180) / Math.PI
      const rotation = normalizeAngle(snapAngle(turned, ev.shiftKey))
      const current = store.get().items.find((i) => i.id === item.id) ?? item
      patchItem(store, item.id, { rotation, ...within(current.x, current.y, w, h, rotation, page) })
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
    else store.set({ selected: [item.id], editing: item.id })
  }

  // Keys act on the whole selection; shortcuts with Ctrl or Cmd belong to the editor.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (editing || e.ctrlKey || e.metaKey || e.altKey) return
    const step = e.shiftKey ? 10 : 1
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    const onItem = e.target === e.currentTarget
    if (moves[e.key]) {
      e.preventDefault()
      moveSelection(store, ...moves[e.key])
    } else if (e.key.toLowerCase() === 'r') {
      e.preventDefault()
      turnSelection(store, e.shiftKey ? -90 : 90)
    } else if (e.key === '[' || e.key === ']') {
      e.preventDefault()
      turnSelection(store, e.key === ']' ? 5 : -5)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      deleteSelection(store)
    } else if (e.key === 'Enter' && onItem && item.type === 'text' && count === 1) {
      e.preventDefault()
      edit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      store.set({ selected: [] })
      ref.current?.blur()
    }
  }

  const shown = size()
  const small = Math.min(shown.w || 99, shown.h || 99) * zoom < 30
  const rotation = rotationOf(item)
  // How far the turned item reaches past its upright box, so the toolbar and grip clear it.
  const reach = turnedSize(shown.w * zoom, shown.h * zoom, rotation)
  const extX = (reach.w - shown.w * zoom) / 2
  const extY = (reach.h - shown.h * zoom) / 2

  const style = { left: item.x * zoom, top: item.y * zoom, '--ext-x': `${extX}px`, '--ext-y': `${extY}px` } as CSSProperties
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
        // Tabbing in selects it; a click already chose what to select.
        if (e.target === e.currentTarget && e.currentTarget.matches(':focus-visible') && !store.get().selected.includes(item.id)) store.set({ selected: [item.id] })
      }}
    >
      <div className="item__body" style={rotation ? { transform: `rotate(${rotation}deg)` } : undefined}>
        {item.type === 'signature' ? <SignatureArt signature={item.signature} className="item__sig" /> : null}
        {item.type === 'mark' ? (
          <svg viewBox="0 0 256 256" className="item__mark" aria-hidden>
            <path d={MARK_PATHS[item.mark]} fill={item.color} />
          </svg>
        ) : null}
        {item.type === 'text' ? <TextBody item={item} zoom={zoom} editing={editing} /> : null}
        {selected && count === 1 && !editing ? (
          <>
            <span className="item__handle" onPointerDown={startResize} aria-hidden />
            {!small ? (
              <span className="item__turn" onPointerDown={startTurn} title="Arrastra para girar" aria-hidden>
                <ArrowClockwise size={10} weight="bold" />
              </span>
            ) : null}
          </>
        ) : null}
      </div>

      {selected && count === 1 && !editing ? (
        <>
          {small ? (
            // Too small to grab without covering it: a grip outside the item.
            <span className="item__grip" onPointerDown={startDrag} title="Arrastra para mover" aria-hidden>
              <ArrowsOutCardinal size={14} weight="bold" />
            </span>
          ) : null}
        </>
      ) : null}
      {primary && !editing ? <ItemToolbar item={item} count={count} flip={item.y * zoom - extY < 52} /> : null}
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
        selected: [],
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

function ItemToolbar({ item, count, flip }: { item: Item; count: number; flip: boolean }) {
  const store = useDocStore()
  const onTurn = (delta: number) => turnSelection(store, delta)
  const copy = (
    <button type="button" className="item-bar__btn" onClick={() => copySelection(store)} aria-label="Copiar" title="Copiar (Ctrl+C)">
      <Copy size={16} weight="bold" aria-hidden />
    </button>
  )
  const remove = (
    <button type="button" className="item-bar__btn item-bar__btn--danger" onClick={() => deleteSelection(store)} aria-label="Eliminar" title="Eliminar (Supr)">
      <Trash size={16} weight="bold" aria-hidden />
    </button>
  )
  // Several picked: only what applies to all of them.
  if (count > 1) {
    return (
      <div className="item-bar" data-flip={flip || undefined} role="toolbar" aria-label="Opciones de la selección" onPointerDown={(e) => e.stopPropagation()}>
        <span className="item-bar__count" aria-live="polite">
          {count} elementos
        </span>
        <span className="item-bar__sep" aria-hidden />
        {copy}
        <span className="item-bar__sep" aria-hidden />
        <span className="item-bar__turn" role="group" aria-label="Girar">
          <button type="button" className="item-bar__btn" data-turn="left" onClick={() => onTurn(-90)} aria-label="Girar a la izquierda" title="Girar a la izquierda (Mayús+R)">
            <ArrowArcLeft size={16} weight="bold" aria-hidden />
          </button>
          <button type="button" className="item-bar__btn" onClick={() => onTurn(90)} aria-label="Girar a la derecha" title="Girar a la derecha (R)">
            <ArrowArcRight size={16} weight="bold" aria-hidden />
          </button>
        </span>
        <span className="item-bar__sep" aria-hidden />
        {remove}
      </div>
    )
  }
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
      <span className="item-bar__turn" role="group" aria-label="Girar">
        <button type="button" className="item-bar__btn" data-turn="left" onClick={() => onTurn(-90)} aria-label="Girar a la izquierda" title="Girar a la izquierda (Mayús+R)">
          <ArrowArcLeft size={16} weight="bold" aria-hidden />
        </button>
        {rotationOf(item) ? (
          <span className="item-bar__value item-bar__value--angle" aria-live="polite">
            {rotationOf(item)}°
          </span>
        ) : null}
        <button type="button" className="item-bar__btn" onClick={() => onTurn(90)} aria-label="Girar a la derecha" title="Girar a la derecha (R)">
          <ArrowArcRight size={16} weight="bold" aria-hidden />
        </button>
      </span>
      <span className="item-bar__sep" aria-hidden />
      {copy}
      {item.type === 'signature' ? <DownloadMenu item={item} /> : null}
      <span className="item-bar__sep" aria-hidden />
      {remove}
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

// The signature as it shows on the page, to keep or use elsewhere.
function DownloadMenu({ item }: { item: SignatureItem }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const outside = (e: PointerEvent) => {
      const target = e.target as Node
      if (!menu.current?.contains(target) && !button.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside, true)
    return () => document.removeEventListener('pointerdown', outside, true)
  }, [open])

  const save = async (format: SignatureFormat) => {
    setOpen(false)
    setBusy(true)
    try {
      saveBlob(await signatureFile(item.signature, rotationOf(item), format), `firma.${format}`)
      toast(`Firma descargada en ${format.toUpperCase()}`, { tone: 'success' })
    } catch {
      toast('No se pudo descargar la firma. Intenta de nuevo.', { tone: 'error' })
    } finally {
      setBusy(false)
      button.current?.focus()
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // The item moves with arrows and deselects with Escape; inside the menu they mean something else.
    e.stopPropagation()
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const at = items.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Escape') e.preventDefault()
      setOpen(false)
      button.current?.focus()
    }
  }

  return (
    <span className="item-bar__download">
      <button
        ref={button}
        type="button"
        className="item-bar__btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Descargar firma"
        title="Descargar firma"
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
      >
        {busy ? <span className="spinner" aria-hidden /> : <DownloadSimple size={16} weight="bold" aria-hidden />}
      </button>
      {open ? (
        <div ref={menu} className="item-menu" role="menu" aria-label="Descargar firma" onKeyDown={onKeyDown}>
          <button type="button" role="menuitem" className="item-menu__item" onClick={() => save('svg')}>
            <span>SVG</span>
            <span className="item-menu__hint">Vectorial, nítida a cualquier tamaño</span>
          </button>
          <button type="button" role="menuitem" className="item-menu__item" onClick={() => save('png')}>
            <span>PNG</span>
            <span className="item-menu__hint">Imagen con fondo transparente</span>
          </button>
        </div>
      ) : null}
    </span>
  )
}
