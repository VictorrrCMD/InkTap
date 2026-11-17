import type { Field, FieldValue, OpenedPdf, PageInfo, Rect } from './model'
import { ASSETS, AnnotationType, getDocument, PasswordResponses, type PdfPage, type Viewport } from './pdfjs'

export class PasswordNeeded extends Error {
  constructor(public incorrect: boolean) {
    super(incorrect ? 'incorrect-password' : 'password-needed')
  }
}

export class NotAPdf extends Error {
  constructor() {
    super('not-a-pdf')
  }
}

export function looksLikePdf(bytes: Uint8Array): boolean {
  // The header may be preceded by junk; readers accept it within the first KB.
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024))
  return head.includes('%PDF-')
}

export async function openPdf(bytes: Uint8Array, password?: string): Promise<OpenedPdf> {
  if (!looksLikePdf(bytes)) throw new NotAPdf()

  // pdf.js transfers the buffer to its worker; keep the original for export.
  const task = getDocument({ data: bytes.slice(), password, ...ASSETS, enableXfa: false })
  let pdf
  try {
    pdf = await task.promise
  } catch (error) {
    const e = error as { name?: string; code?: number }
    if (e?.name === 'PasswordException') {
      throw new PasswordNeeded(e.code === PasswordResponses.INCORRECT_PASSWORD)
    }
    if (e?.name === 'InvalidPDFException') throw new NotAPdf()
    throw error
  }

  const loaded = await Promise.all(
    Array.from({ length: pdf.numPages }, async (_, index) => {
      const page = await pdf.getPage(index + 1)
      const viewport = page.getViewport({ scale: 1 })
      const info: PageInfo = {
        index,
        width: viewport.width,
        height: viewport.height,
        rotation: viewport.rotation,
        viewport,
      }
      const annotations = await readAnnotations(page)
      return { info, annotations, viewport }
    }),
  )

  const pages: PageInfo[] = []
  const fields: Field[] = []
  const initial: Record<string, FieldValue> = {}
  for (const { info, annotations, viewport } of loaded) {
    pages.push(info)
    for (const annotation of annotations) {
      const field = toField(annotation, info.index, viewport)
      if (!field) continue
      fields.push(field)
      readInitial(annotation, field, initial)
    }
  }

  sortReadingOrder(fields)
  return {
    pdf,
    pages,
    fields,
    initial,
    isXfa: Boolean((pdf as { isPureXfa?: boolean }).isPureXfa),
    close: () => task.destroy(),
  }
}

async function readAnnotations(page: PdfPage): Promise<Annotation[]> {
  try {
    return (await page.getAnnotations({ intent: 'display' })) as Annotation[]
  } catch {
    // A damaged annotation dictionary shouldn't stop the page from opening.
    return []
  }
}

// The subset of pdf.js widget data this app reads. pdf.js doesn't type it.
interface Annotation {
  annotationType: number
  id: string
  rect: number[]
  hidden?: boolean
  fieldName?: string
  fieldType?: 'Tx' | 'Btn' | 'Ch' | 'Sig'
  fieldValue?: string | string[] | null
  alternativeText?: string
  readOnly?: boolean
  required?: boolean
  multiLine?: boolean
  maxLen?: number
  comb?: boolean
  textAlignment?: number | null
  defaultAppearanceData?: { fontSize?: number; fontColor?: ArrayLike<number> }
  borderStyle?: { width?: number; style?: number }
  borderColor?: ArrayLike<number> | null
  backgroundColor?: ArrayLike<number> | null
  checkBox?: boolean
  radioButton?: boolean
  pushButton?: boolean
  exportValue?: string
  buttonValue?: string
  options?: { exportValue: string; displayValue: string }[]
  multiSelect?: boolean
}

function toRect(rect: number[], viewport: Viewport): Rect {
  const [x1, y1] = viewport.convertToViewportPoint(rect[0], rect[1])
  const [x2, y2] = viewport.convertToViewportPoint(rect[2], rect[3])
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) }
}

function cssColor(rgb: ArrayLike<number> | null | undefined): string | undefined {
  if (!rgb || rgb.length < 3) return undefined
  return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`
}

function toField(a: Annotation, page: number, viewport: Viewport): Field | null {
  if (a.annotationType !== AnnotationType.WIDGET || a.hidden || !a.fieldName || !a.fieldType) return null
  const rect = toRect(a.rect, viewport)
  if (rect.w < 3 || rect.h < 3) return null

  const borderWidth = a.borderStyle?.width ?? 0
  const borderColor = cssColor(a.borderColor)
  const [px1, py1, px2, py2] = a.rect
  const base = {
    id: a.id,
    name: a.fieldName,
    page,
    rect,
    pdfRect: [Math.min(px1, px2), Math.min(py1, py2), Math.max(px1, px2), Math.max(py1, py2)] as [number, number, number, number],
    rotation: viewport.rotation,
    readOnly: Boolean(a.readOnly),
    required: Boolean(a.required),
    label: a.alternativeText?.trim() || undefined,
    background: cssColor(a.backgroundColor),
    border:
      borderWidth > 0 && borderColor
        ? {
            width: borderWidth,
            color: borderColor,
            style: a.borderStyle?.style === 2 ? ('dashed' as const) : a.borderStyle?.style === 5 ? ('underline' as const) : ('solid' as const),
          }
        : undefined,
  }

  switch (a.fieldType) {
    case 'Tx':
      return {
        ...base,
        kind: 'text',
        multiline: Boolean(a.multiLine),
        maxLen: a.maxLen && a.maxLen > 0 ? a.maxLen : undefined,
        comb: Boolean(a.comb && a.maxLen),
        fontSize: a.defaultAppearanceData?.fontSize ?? 0,
        textColor: cssColor(a.defaultAppearanceData?.fontColor),
        align: a.textAlignment === 1 ? 'center' : a.textAlignment === 2 ? 'right' : 'left',
      }
    case 'Btn':
      if (a.pushButton) return null
      if (a.radioButton && a.buttonValue) return { ...base, kind: 'radio', onValue: a.buttonValue }
      if (a.checkBox) return { ...base, kind: 'checkbox', onValue: a.exportValue || 'Yes' }
      return null
    case 'Ch':
      return {
        ...base,
        kind: 'select',
        options: (a.options ?? []).map((o) => ({ value: o.exportValue, label: o.displayValue || o.exportValue })),
        multiSelect: Boolean(a.multiSelect),
        fontSize: a.defaultAppearanceData?.fontSize ?? 0,
        textColor: cssColor(a.defaultAppearanceData?.fontColor),
      }
    case 'Sig':
      return { ...base, kind: 'signature' }
    default:
      return null
  }
}

function readInitial(a: Annotation, field: Field, initial: Record<string, FieldValue>) {
  const raw = Array.isArray(a.fieldValue) ? a.fieldValue[0] : a.fieldValue
  const value = typeof raw === 'string' ? raw : ''
  switch (field.kind) {
    case 'text':
    case 'select':
      initial[field.name] ??= value
      break
    case 'checkbox':
    case 'radio':
      if (value && value !== 'Off' && value === field.onValue) initial[field.name] = value
      else initial[field.name] ??= ''
      break
    case 'signature':
      break
  }
}

// Tab order follows the page: top to bottom, then left to right within a
// line. Fields whose tops sit within half a field height share a line.
function sortReadingOrder(fields: Field[]) {
  fields.sort((a, b) => a.page - b.page || a.rect.y - b.rect.y || a.rect.x - b.rect.x)
  const ordered: Field[] = []
  let line: Field[] = []
  const flush = () => {
    line.sort((a, b) => a.rect.x - b.rect.x)
    ordered.push(...line)
    line = []
  }
  for (const field of fields) {
    const first = line[0]
    if (first && (first.page !== field.page || field.rect.y - first.rect.y > Math.min(first.rect.h, field.rect.h) * 0.5)) flush()
    line.push(field)
  }
  flush()
  fields.splice(0, fields.length, ...ordered)
}
