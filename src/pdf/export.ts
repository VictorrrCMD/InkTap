import type { Field, FieldValue, Item, PageInfo } from './model'
import { MARK_BOX, MARK_PATHS } from './marks'
import { turnPoint } from './turn'

type Lib = typeof import('@cantoo/pdf-lib')
type PDFDocument = Awaited<ReturnType<Lib['PDFDocument']['load']>>
type PDFField = ReturnType<ReturnType<PDFDocument['getForm']>['getFields']>[number]

export interface ExportInput {
  bytes: Uint8Array
  password?: string
  pages: PageInfo[]
  fields: Field[]
  initial: Record<string, FieldValue>
  values: Record<string, FieldValue>
  // The size each filled text field was shown at, so the PDF matches it.
  fontSizes: Record<string, number>
  items: Item[]
  // Where the first baseline of a text item sits below its top, in ems, as
  // measured from the font the browser used to show it.
  baseline: number
  lineHeight: number
  flatten: boolean
}

export interface ExportResult {
  bytes: Uint8Array
  flattened: boolean
  skipped: string[]
}

export async function exportPdf(input: ExportInput): Promise<ExportResult> {
  const lib = await import('@cantoo/pdf-lib')
  if (input.flatten) {
    try {
      return await build(lib, input, true)
    } catch (error) {
      // Some forms carry widgets that can't be flattened; keep the values in
      // live fields rather than fail the download.
      console.warn('Flatten failed, exporting with live fields', error)
    }
  }
  return build(lib, input, false)
}

async function build(lib: Lib, input: ExportInput, flatten: boolean): Promise<ExportResult> {
  const { PDFDocument, StandardFonts, degrees } = lib
  // A password (even an empty one) decrypts owner-protected forms; it's
  // ignored when the file isn't encrypted.
  const doc = await PDFDocument.load(input.bytes, { password: input.password ?? '', updateMetadata: false })
  const skipped = fillFields(lib, doc, input)

  const font = await doc.embedFont(StandardFonts.Helvetica)
  const pages = doc.getPages()
  const images = new Map<string, Awaited<ReturnType<PDFDocument['embedPng']>>>()

  const form = doc.getForm()
  const signedFields = new Set(input.items.flatMap((i) => (i.type === 'signature' && i.fieldId ? [i.fieldId] : [])))
  for (const field of input.fields) {
    if (field.kind !== 'signature') continue
    // A signature drawn into a signature field replaces the field: left in
    // place, its widget would paint over the ink. Flattening drops the rest.
    if (signedFields.has(field.id) || flatten) removeField(form, field.name)
  }

  if (flatten) form.flatten({ updateFieldAppearances: true })

  // Drawn after flattening, so field backgrounds never cover what was placed on top of them.
  for (const item of input.items) {
    const page = pages[item.page]
    const info = input.pages[item.page]
    if (!page || !info) continue
    const vp = info.viewport
    // Every anchor turns with the item around its center; the page's own
    // rotation and the item's turn add up (PDF angles go the other way).
    const turn = item.rotation ?? 0
    const rotate = degrees(info.rotation - turn)
    const lines = item.type === 'text' ? item.text.split('\n') : []
    const box =
      item.type === 'signature'
        ? { w: item.w, h: item.h }
        : item.type === 'mark'
          ? { w: item.size, h: item.size }
          : { w: Math.max(0, ...lines.map((l) => font.widthOfTextAtSize(toWinAnsi(l), item.size))), h: lines.length * item.size * input.lineHeight }
    const at = (px: number, py: number) => vp.convertToPdfPoint(...turnPoint(px, py, item.x + box.w / 2, item.y + box.h / 2, turn))

    if (item.type === 'signature') {
      const sig = item.signature
      const color = hexToRgb(lib, sig.color)
      if (sig.kind === 'ink' && sig.paths) {
        const [x, y] = at(item.x, item.y)
        const scale = item.w / sig.w
        for (const d of sig.paths) page.drawSvgPath(d, { x, y, scale, color, rotate, borderWidth: 0 })
      } else if (sig.kind === 'image' && sig.src) {
        let image = images.get(sig.id)
        if (!image) {
          image = await doc.embedPng(dataUrlBytes(sig.src))
          images.set(sig.id, image)
        }
        const [x, y] = at(item.x, item.y + item.h)
        page.drawImage(image, { x, y, width: item.w, height: item.h, rotate })
      }
    } else if (item.type === 'text') {
      const color = hexToRgb(lib, item.color)
      lines.forEach((line, i) => {
        const text = toWinAnsi(line)
        if (!text.trim()) return
        const top = item.y + item.size * (input.baseline + i * input.lineHeight)
        const [x, y] = at(item.x, top)
        page.drawText(text, { x, y, size: item.size, font, color, rotate })
      })
    } else if (item.type === 'mark') {
      const [x, y] = at(item.x, item.y)
      page.drawSvgPath(MARK_PATHS[item.mark], {
        x,
        y,
        scale: item.size / MARK_BOX,
        color: hexToRgb(lib, item.color),
        rotate,
        borderWidth: 0,
      })
    }
  }

  const bytes = await doc.save({ useObjectStreams: true })
  return { bytes, flattened: flatten, skipped }
}

function removeField(form: ReturnType<PDFDocument['getForm']>, name: string) {
  const field = form.getFieldMaybe(name)
  if (!field) return
  try {
    form.removeField(field)
  } catch (error) {
    console.warn('Could not remove field', name, error)
  }
}

function fillFields(lib: Lib, doc: PDFDocument, input: ExportInput): string[] {
  const { PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFOptionList, PDFName } = lib
  const form = doc.getForm()
  const skipped: string[] = []
  const byName = new Map<string, Field[]>()
  for (const f of input.fields) byName.set(f.name, [...(byName.get(f.name) ?? []), f])

  for (const [name, value] of Object.entries(input.values)) {
    if (value === (input.initial[name] ?? '')) continue
    const widgets = byName.get(name)
    if (!widgets || widgets[0].kind === 'signature' || widgets[0].readOnly) continue
    const field = form.getFieldMaybe(name) ?? findByRect(doc, form.getFields(), widgets[0])
    if (!field) {
      skipped.push(name)
      continue
    }
    const size = input.fontSizes[name]
    const setSize = (f: { setFontSize(n: number): void }) => {
      if (!size) return
      try {
        f.setFontSize(Math.round(size * 10) / 10)
      } catch {
        // No /DA font operator to rewrite: the field keeps its own size.
      }
    }
    try {
      if (field instanceof PDFTextField) {
        const max = field.getMaxLength()
        const text = toWinAnsi(value)
        setSize(field)
        field.setText(max ? text.slice(0, max) : text)
      } else if (field instanceof PDFCheckBox || field instanceof PDFRadioGroup) {
        setButtonValue(PDFName, field, value, widgets)
      } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
        setSize(field)
        if (!value) field.clear()
        else {
          const label = widgets[0].options?.find((o) => o.value === value)?.label ?? value
          const options = field.getOptions()
          field.select(options.includes(label) ? label : options.includes(value) ? value : label)
        }
      }
    } catch (error) {
      console.warn('Could not fill field', name, error)
      skipped.push(name)
    }
  }
  return skipped
}

// /V must hold the on-widget's appearance state, which can differ from the
// value pdf.js reports (/Opt maps "/1" to "completo"): match the widget by rect.
function setButtonValue(PDFName: Lib['PDFName'], field: PDFField, value: string, candidates: Field[]) {
  const acro = (field as unknown as { acroField: ButtonAcro }).acroField
  const widgets = acro.getWidgets()
  const off = PDFName.of('Off')
  let next = off
  if (value) {
    const clicked = candidates.find((f) => f.onValue === value)
    const byRect = clicked ? widgets.find((w) => rectMatches(w.getRectangle(), clicked.pdfRect)) : undefined
    const byName = widgets.find((w) => w.getOnValue() === PDFName.of(value))
    next = ((byRect ?? byName)?.getOnValue() as typeof off | undefined) ?? off
  }
  acro.dict.set(PDFName.of('V'), next)
  for (const widget of widgets) widget.setAppearanceState(widget.getOnValue() === next ? next : off)
  ;(field as unknown as { markAsDirty(): void }).markAsDirty()
}

interface ButtonAcro {
  dict: { set(key: unknown, value: unknown): void }
  getWidgets(): { getOnValue(): unknown; setAppearanceState(state: unknown): void; getRectangle(): { x: number; y: number; width: number; height: number } }[]
}

// pdf.js normalizes rectangles; a file may store them flipped, so normalize
// pdf-lib's side too before comparing.
function rectMatches(r: { x: number; y: number; width: number; height: number }, [x1, y1, x2, y2]: Field['pdfRect']) {
  const near = (a: number, b: number) => Math.abs(a - b) < 1.5
  const left = Math.min(r.x, r.x + r.width)
  const bottom = Math.min(r.y, r.y + r.height)
  return near(left, x1) && near(bottom, y1) && near(Math.abs(r.width), x2 - x1) && near(Math.abs(r.height), y2 - y1)
}

// Last resort when a field's name doesn't resolve (odd encodings): match the
// widget pdf.js reported by its rectangle on the same page.
function findByRect(doc: PDFDocument, fields: PDFField[], target: Field): PDFField | undefined {
  const page = doc.getPages()[target.page]
  if (!page) return undefined
  for (const field of fields) {
    for (const widget of field.acroField.getWidgets()) {
      const pageRef = widget.P()
      if (pageRef && pageRef !== page.ref) continue
      if (rectMatches(widget.getRectangle(), target.pdfRect)) return field
    }
  }
  return undefined
}

function hexToRgb(lib: Lib, hex: string) {
  const n = parseInt(hex.replace('#', ''), 16)
  return lib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

function dataUrlBytes(url: string): Uint8Array {
  const base64 = url.slice(url.indexOf(',') + 1)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// Unembedded Helvetica speaks WinAnsi only: Spanish fits, other letters lose
// their accents or become '?'. The set holds WinAnsi's 0x80-0x9F code points.
const WIN_ANSI_HIGH = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018,
  0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
])

function encodable(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0
  return (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_HIGH.has(code)
}

export function toWinAnsi(text: string): string {
  let out = ''
  for (const ch of text.normalize('NFC').replace(/\t/g, ' ')) {
    if (ch === '\n' || encodable(ch)) {
      out += ch
      continue
    }
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '')
    out += base && [...base].every(encodable) ? base : '?'
  }
  return out
}
