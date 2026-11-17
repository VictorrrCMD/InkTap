import { uid } from '../lib/bytes'
import type { Item, PageInfo } from '../pdf/model'
import { normalizeAngle, turnedSize } from '../pdf/turn'
import { toast } from '../ui/toast'
import { addItems, commitItems, patchItems, removeItems, undo, type DocStore } from './doc'
import { estimateTextBox } from './place'

const PASTE_OFFSET = 12

export const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), Math.max(min, max))
export const rotationOf = (item: Item) => item.rotation ?? 0

// Set while two fingers zoom the document, so an item drag that began under one of them lets go.
export const gesture = { pinching: false }

// Text has no stored size; ItemView records what the browser drew, in page points.
export const textBoxes = new Map<string, { w: number; h: number }>()

export function itemSize(item: Item) {
  if (item.type === 'signature') return { w: item.w, h: item.h }
  if (item.type === 'mark') return { w: item.size, h: item.size }
  return textBoxes.get(item.id) ?? estimateTextBox(item.text || 'M', item.size)
}

// Keeps the turned item's outline on the page.
export function within(x: number, y: number, w: number, h: number, deg: number, page: PageInfo) {
  const t = turnedSize(w, h, deg)
  const ex = (t.w - w) / 2
  const ey = (t.h - h) / 2
  return { x: clamp(x, ex, page.width - w - ex), y: clamp(y, ey, page.height - h - ey) }
}

const selectedItems = (store: DocStore) => {
  const { items, selected } = store.get()
  return items.filter((i) => selected.includes(i.id))
}

// Moves each item from where it started by one shared offset, cut short so none leaves its page.
export function offsetItems(store: DocStore, from: Item[], dx: number, dy: number) {
  const { pages } = store.get()
  let [loX, hiX, loY, hiY] = [-Infinity, Infinity, -Infinity, Infinity]
  for (const item of from) {
    const { w, h } = itemSize(item)
    const page = pages[item.page]
    const t = turnedSize(w, h, rotationOf(item))
    const ex = (t.w - w) / 2
    const ey = (t.h - h) / 2
    loX = Math.max(loX, ex - item.x)
    hiX = Math.min(hiX, page.width - w - ex - item.x)
    loY = Math.max(loY, ey - item.y)
    hiY = Math.min(hiY, page.height - h - ey - item.y)
  }
  const mx = loX > hiX ? 0 : clamp(dx, loX, hiX)
  const my = loY > hiY ? 0 : clamp(dy, loY, hiY)
  patchItems(store, new Map(from.map((i) => [i.id, { x: i.x + mx, y: i.y + my }])))
}

export function moveSelection(store: DocStore, dx: number, dy: number) {
  const picked = selectedItems(store)
  if (!picked.length) return
  const before = store.get().items
  offsetItems(store, picked, dx, dy)
  commitItems(store, store.get().items, before)
}

// Each item turns around its own center.
export function turnSelection(store: DocStore, delta: number) {
  const picked = selectedItems(store)
  if (!picked.length) return
  const { items: before, pages } = store.get()
  const patches = new Map<string, Partial<Item>>()
  for (const item of picked) {
    const rotation = normalizeAngle(rotationOf(item) + delta)
    const { w, h } = itemSize(item)
    patches.set(item.id, { rotation, ...within(item.x, item.y, w, h, rotation, pages[item.page]) })
  }
  patchItems(store, patches)
  commitItems(store, store.get().items, before)
}

export function deleteSelection(store: DocStore) {
  const ids = store.get().selected
  if (!ids.length) return
  removeItems(store, ids)
  toast(ids.length === 1 ? 'Elemento eliminado' : `${ids.length} elementos eliminados`, { action: { label: 'Deshacer', run: () => undo(store) } })
}

export function selectAll(store: DocStore) {
  store.set((s) => ({ selected: s.items.map((i) => i.id), editing: null }))
}

const touchOnly = () => window.matchMedia('(pointer: coarse)').matches

export function copySelection(store: DocStore, quiet = false) {
  const picked = selectedItems(store)
  if (!picked.length) return 0
  store.set({ clipboard: picked, pastes: {} })
  if (!quiet) {
    const what = picked.length === 1 ? 'Copiado' : `${picked.length} elementos copiados`
    toast(touchOnly() ? `${what}. Toca Pegar para ponerlo en la página que estás viendo.` : `${what}. Pégalo con Ctrl+V en la página que estás viendo.`)
  }
  return picked.length
}

export function cutSelection(store: DocStore) {
  const ids = store.get().selected
  if (!copySelection(store, true)) return
  removeItems(store, ids)
  toast(ids.length === 1 ? 'Recortado' : `${ids.length} elementos recortados`, { action: { label: 'Deshacer', run: () => undo(store) } })
}

// A copy owns no form field: the original still fills it.
function copyOf(item: Item, page: number, dx: number, dy: number): Item {
  const copy = { ...item, id: uid('i_'), page, x: item.x + dx, y: item.y + dy }
  if (copy.type === 'signature') delete copy.fieldId
  const box = textBoxes.get(item.id)
  if (box) textBoxes.set(copy.id, box)
  return copy
}

function landOnPages(store: DocStore, copies: Item[]) {
  const { pages } = store.get()
  return copies.map((item) => {
    const { w, h } = itemSize(item)
    return { ...item, ...within(item.x, item.y, w, h, rotationOf(item), pages[item.page]) }
  })
}

// Copies from one page land on the page in view: nudged when it is the same
// page, so they don't hide the originals, and at the same spot on any other.
export function paste(store: DocStore) {
  const { clipboard, currentPage, pastes } = store.get()
  if (!clipboard.length) return
  const onePage = clipboard.every((i) => i.page === clipboard[0].page)
  const target = onePage ? currentPage : null
  const key = target ?? -1
  const count = (pastes[key] ?? 0) + (onePage && clipboard[0].page !== currentPage ? 0 : 1)
  const shift = PASTE_OFFSET * count
  const copies = clipboard.map((item) => copyOf(item, target ?? item.page, shift, shift))
  addItems(store, landOnPages(store, copies))
  store.set((s) => ({ pastes: { ...s.pastes, [key]: (s.pastes[key] ?? 0) + 1 } }))
}

export function duplicateSelection(store: DocStore) {
  const picked = selectedItems(store)
  if (!picked.length) return
  addItems(store, landOnPages(store, picked.map((item) => copyOf(item, item.page, PASTE_OFFSET, PASTE_OFFSET))))
}
