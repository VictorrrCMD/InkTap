import { uid } from '../lib/bytes'
import { INK_COLORS, type Field, type Item, type Signature, type SignatureItem } from '../pdf/model'
import { addItem, type DocStore, type Tool } from './doc'

export const TEXT_SIZE = 11
export const MARK_SIZE = 13
export const LINE_HEIGHT = 1.2

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), Math.max(min, max))

export function todayText(): string {
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date())
}

// A signature lands about as wide as a signature line on a letter page.
export function signatureSize(signature: Signature, pageWidth: number) {
  const ratio = signature.h / signature.w
  let w = Math.min(170, pageWidth * 0.36)
  let h = w * ratio
  if (h > 62) {
    h = 62
    w = h / ratio
  }
  return { w, h }
}

// Rough extent of a text item before the DOM has measured it.
export function estimateTextBox(text: string, size: number) {
  const lines = text.split('\n')
  const longest = Math.max(1, ...lines.map((l) => l.length))
  return { w: longest * size * 0.55, h: lines.length * size * LINE_HEIGHT }
}

export function placeTool(store: DocStore, tool: Tool, pageIndex: number, cx: number, cy: number) {
  const page = store.get().pages[pageIndex]
  if (!page) return
  let item: Item
  if (tool.kind === 'signature') {
    const { w, h } = signatureSize(tool.signature, page.width)
    item = {
      id: uid('i_'),
      type: 'signature',
      page: pageIndex,
      x: clamp(cx - w / 2, 0, page.width - w),
      y: clamp(cy - h / 2, 0, page.height - h),
      w,
      h,
      signature: tool.signature,
    }
  } else if (tool.kind === 'mark') {
    item = {
      id: uid('i_'),
      type: 'mark',
      page: pageIndex,
      mark: 'check',
      size: MARK_SIZE,
      color: INK_COLORS.black,
      x: clamp(cx - MARK_SIZE / 2, 0, page.width - MARK_SIZE),
      y: clamp(cy - MARK_SIZE / 2, 0, page.height - MARK_SIZE),
    }
  } else {
    const text = tool.kind === 'date' ? todayText() : ''
    const box = estimateTextBox(text || 'M', TEXT_SIZE)
    item = {
      id: uid('i_'),
      type: 'text',
      page: pageIndex,
      text,
      size: TEXT_SIZE,
      color: INK_COLORS.black,
      x: clamp(cx, 0, page.width - box.w),
      y: clamp(cy - (TEXT_SIZE * LINE_HEIGHT) / 2, 0, page.height - box.h),
    }
  }
  addItem(store, item)
  if (item.type === 'text' && !item.text) store.set({ editing: item.id })
}

// Fits the ink inside the field's box, centered, leaving a little air.
export function placeInField(store: DocStore, signature: Signature, field: Field) {
  const pad = Math.min(field.rect.w, field.rect.h) * 0.08
  const maxW = field.rect.w - pad * 2
  const maxH = field.rect.h - pad * 2
  const scale = Math.min(maxW / signature.w, maxH / signature.h)
  const w = signature.w * scale
  const h = signature.h * scale
  const existing = store.get().items.find((i) => i.type === 'signature' && i.fieldId === field.id)
  const item: SignatureItem = {
    id: existing?.id ?? uid('i_'),
    type: 'signature',
    page: field.page,
    x: field.rect.x + (field.rect.w - w) / 2,
    y: field.rect.y + (field.rect.h - h) / 2,
    w,
    h,
    signature,
    fieldId: field.id,
  }
  if (existing) {
    const { items } = store.get()
    store.set((s) => ({
      items: items.map((i) => (i.id === existing.id ? item : i)),
      undo: [...s.undo, items],
      redo: [],
      selected: [item.id],
      tool: null,
    }))
  } else addItem(store, item)
}
