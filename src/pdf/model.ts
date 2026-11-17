import type { PdfDoc, Viewport } from './pdfjs'

// Positions are "page points": PDF units of the page as displayed (rotation
// applied, origin top-left). Times zoom gives CSS pixels.

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface PageInfo {
  index: number
  width: number
  height: number
  rotation: number
  viewport: Viewport
}

export type FieldKind = 'text' | 'checkbox' | 'radio' | 'select' | 'signature'

export interface Field {
  id: string
  name: string
  kind: FieldKind
  page: number
  rect: Rect
  // The widget's rectangle in PDF user space, as the file states it.
  pdfRect: [number, number, number, number]
  // The page's /Rotate: the field's content turns with the page on screen.
  rotation: number
  readOnly: boolean
  required: boolean
  label?: string
  multiline?: boolean
  maxLen?: number
  comb?: boolean
  fontSize?: number
  textColor?: string
  align?: 'left' | 'center' | 'right'
  options?: { value: string; label: string }[]
  multiSelect?: boolean
  onValue?: string
  border?: { width: number; color: string; style: 'solid' | 'dashed' | 'underline' }
  background?: string
}

// Text and select values are strings; a checkbox or radio group stores the
// export value that is on, or '' when off.
export type FieldValue = string

export interface Signature {
  id: string
  kind: 'ink' | 'image'
  w: number
  h: number
  paths?: string[]
  src?: string
  color: string
  source: 'draw' | 'phone' | 'type' | 'photo'
}

interface ItemBase {
  id: string
  page: number
  x: number
  y: number
}

export interface SignatureItem extends ItemBase {
  type: 'signature'
  w: number
  h: number
  signature: Signature
  fieldId?: string
}

export interface TextItem extends ItemBase {
  type: 'text'
  text: string
  size: number
  color: string
}

export interface MarkItem extends ItemBase {
  type: 'mark'
  mark: 'check' | 'cross'
  size: number
  color: string
}

export type Item = SignatureItem | TextItem | MarkItem

export interface OpenedPdf {
  pdf: PdfDoc
  pages: PageInfo[]
  fields: Field[]
  initial: Record<string, FieldValue>
  isXfa: boolean
  // Ends the pdf.js worker's copy of the document.
  close: () => Promise<void>
}

export const INK_COLORS = {
  blue: '#1e3a9e',
  black: '#16181d',
} as const

export type InkColor = keyof typeof INK_COLORS
