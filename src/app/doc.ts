import { createContext, useContext } from 'react'
import { createStore, useStore, type Store } from '../lib/store'
import type { Field, FieldValue, Item, OpenedPdf, PageInfo, Signature } from '../pdf/model'
import type { PdfDoc } from '../pdf/pdfjs'

export type Tool =
  | { kind: 'signature'; signature: Signature }
  | { kind: 'text' }
  | { kind: 'date' }
  | { kind: 'mark' }

export interface DocState {
  name: string
  bytes: Uint8Array
  password?: string
  pdf: PdfDoc
  pages: PageInfo[]
  fields: Field[]
  initial: Record<string, FieldValue>
  values: Record<string, FieldValue>
  items: Item[]
  // Selection order matters: the last one picked carries the toolbar.
  selected: string[]
  editing: string | null
  tool: Tool | null
  zoom: number
  fitZoom: number
  undo: Item[][]
  redo: Item[][]
  clipboard: Item[]
  // Pastes onto each page since the last copy, so repeated pastes fan out.
  pastes: Record<number, number>
  signDialog: { open: boolean; fieldId?: string }
  lastSignature: Signature | null
  currentPage: number
  close: () => Promise<void>
}

export type DocStore = Store<DocState>

export function createDocStore(opened: OpenedPdf, name: string, bytes: Uint8Array, password?: string): DocStore {
  return createStore<DocState>({
    name,
    bytes,
    password,
    pdf: opened.pdf,
    pages: opened.pages,
    fields: opened.fields,
    initial: opened.initial,
    values: { ...opened.initial },
    items: [],
    selected: [],
    editing: null,
    tool: null,
    zoom: 1,
    fitZoom: 1,
    undo: [],
    redo: [],
    clipboard: [],
    pastes: {},
    signDialog: { open: false },
    lastSignature: null,
    currentPage: 0,
    close: opened.close,
  })
}

export const DocContext = createContext<DocStore | null>(null)

export function useDocStore(): DocStore {
  const store = useContext(DocContext)
  if (!store) throw new Error('DocContext missing')
  return store
}

export function useDoc<S>(selector: (state: DocState) => S): S {
  return useStore(useDocStore(), selector)
}

const HISTORY_LIMIT = 60

// Every change to placed items goes through here so undo has one source.
export function commitItems(store: DocStore, next: Item[], before = store.get().items) {
  store.set((s) => ({
    items: next,
    undo: [...s.undo, before].slice(-HISTORY_LIMIT),
    redo: [],
  }))
}

export function addItems(store: DocStore, added: Item[]) {
  commitItems(store, [...store.get().items, ...added])
  store.set({ selected: added.map((i) => i.id), tool: null })
}

export function addItem(store: DocStore, item: Item) {
  addItems(store, [item])
}

export function removeItems(store: DocStore, ids: string[]) {
  const { items, selected, editing } = store.get()
  const gone = new Set(ids)
  if (!items.some((i) => gone.has(i.id))) return
  commitItems(
    store,
    items.filter((i) => !gone.has(i.id)),
  )
  store.set({ selected: selected.filter((id) => !gone.has(id)), editing: editing && gone.has(editing) ? null : editing })
}

export function removeItem(store: DocStore, id: string) {
  removeItems(store, [id])
}

// Live update while dragging or typing: no history entry until commitItems.
export function patchItem(store: DocStore, id: string, patch: Partial<Item>) {
  store.set((s) => ({
    items: s.items.map((i) => (i.id === id ? ({ ...i, ...patch } as Item) : i)),
  }))
}

export function patchItems(store: DocStore, patches: Map<string, Partial<Item>>) {
  store.set((s) => ({
    items: s.items.map((i) => (patches.has(i.id) ? ({ ...i, ...patches.get(i.id) } as Item) : i)),
  }))
}

// Undo and redo keep whatever is still there selected.
const stillThere = (selected: string[], items: Item[]) => selected.filter((id) => items.some((i) => i.id === id))

export function undo(store: DocStore) {
  const { undo: stack, items } = store.get()
  const previous = stack[stack.length - 1]
  if (!previous) return false
  store.set((s) => ({ items: previous, undo: s.undo.slice(0, -1), redo: [...s.redo, items], selected: stillThere(s.selected, previous), editing: null }))
  return true
}

export function redo(store: DocStore) {
  const { redo: stack, items } = store.get()
  const next = stack[stack.length - 1]
  if (!next) return false
  store.set((s) => ({ items: next, redo: s.redo.slice(0, -1), undo: [...s.undo, items], selected: stillThere(s.selected, next), editing: null }))
  return true
}

export function setValue(store: DocStore, name: string, value: FieldValue) {
  store.set((s) => ({ values: { ...s.values, [name]: value } }))
}

export function isDirty(state: DocState): boolean {
  if (state.items.length) return true
  for (const [name, value] of Object.entries(state.values)) {
    if ((state.initial[name] ?? '') !== value) return true
  }
  return false
}

// Fields a person is expected to fill, one entry per name (a radio group is
// one question), signature fields included.
export function fillableFields(fields: Field[]): Field[] {
  const seen = new Set<string>()
  const out: Field[] = []
  for (const field of fields) {
    if (field.readOnly || seen.has(field.name)) continue
    seen.add(field.name)
    out.push(field)
  }
  return out
}

export function isFieldDone(state: DocState, field: Field): boolean {
  if (field.kind === 'signature') {
    return state.items.some((i) => i.type === 'signature' && i.fieldId && sameField(state.fields, i.fieldId, field))
  }
  if (field.kind === 'checkbox') return true
  return (state.values[field.name] ?? '') !== ''
}

function sameField(fields: Field[], fieldId: string, field: Field) {
  const placed = fields.find((f) => f.id === fieldId)
  return placed?.name === field.name
}
