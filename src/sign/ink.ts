import { getStroke } from 'perfect-freehand'
import { uid } from '../lib/bytes'
import type { Signature } from '../pdf/model'

// Every pad records into the same virtual box, so a phone signature and a mouse
// signature come out with the same line weight.
export const INK_W = 1000
export const INK_H = 380

export interface InkStroke {
  // Flat [x, y, pressure, x, y, pressure, ...] in the virtual box.
  points: number[]
  pen: boolean
}

export interface Ink {
  width: number
  height: number
  strokes: InkStroke[]
}

export function strokeOptions(pen: boolean, last: boolean) {
  return {
    size: 9,
    thinning: 0.6,
    smoothing: 0.55,
    streamline: 0.4,
    simulatePressure: !pen,
    start: { cap: true, taper: 0 },
    end: { cap: true, taper: 0 },
    last,
  }
}

function triples(points: number[]): number[][] {
  const out: number[][] = []
  for (let i = 0; i + 2 < points.length; i += 3) out.push([points[i], points[i + 1], points[i + 2]])
  return out
}

export function strokeOutline(stroke: InkStroke, last = true): number[][] {
  return getStroke(triples(stroke.points), strokeOptions(stroke.pen, last))
}

const round = (n: number) => Math.round(n * 10) / 10

// Quadratic curves through the midpoints of the outline: smooth, and only M,
// Q and Z commands, which every SVG path parser (pdf-lib's included) accepts.
export function outlineToPath(outline: number[][], dx = 0, dy = 0): string {
  const n = outline.length
  if (n < 3) return ''
  const pt = (i: number) => outline[i % n]
  let d = `M${round(pt(0)[0] + dx)} ${round(pt(0)[1] + dy)}`
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pt(i)
    const [x1, y1] = pt(i + 1)
    d += `Q${round(x0 + dx)} ${round(y0 + dy)} ${round((x0 + x1) / 2 + dx)} ${round((y0 + y1) / 2 + dy)}`
  }
  return d + 'Z'
}

export function hasInk(ink: Ink | null | undefined): ink is Ink {
  return !!ink && ink.strokes.some((s) => s.points.length >= 3)
}

// Trims the drawing to its own bounds so placing it in a PDF sizes the ink,
// not the empty pad around it.
export function inkToSignature(ink: Ink, color: string, source: Signature['source']): Signature | null {
  const outlines = ink.strokes.filter((s) => s.points.length >= 3).map((s) => strokeOutline(s))
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const outline of outlines) {
    for (const [x, y] of outline) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (!Number.isFinite(minX)) return null
  const pad = 4
  const w = Math.max(maxX - minX + pad * 2, 20)
  const h = Math.max(maxY - minY + pad * 2, 12)
  const paths = outlines.map((o) => outlineToPath(o, pad - minX, pad - minY)).filter(Boolean)
  return { id: uid('sig_'), kind: 'ink', w: round(w), h: round(h), paths, color, source }
}

export const SCRIPT_FONTS = [
  { id: 'formal', family: 'Great Vibes', label: 'Caligráfica', scale: 1 },
  { id: 'hand', family: 'Homemade Apple', label: 'Manuscrita', scale: 0.72 },
  { id: 'casual', family: 'Caveat', label: 'Sencilla', scale: 1.05 },
] as const

export type ScriptFontId = (typeof SCRIPT_FONTS)[number]['id']

// A typed signature is rendered once to a transparent PNG at print
// resolution; the PDF gets the image, so no font has to be embedded.
export async function typedSignature(text: string, fontId: ScriptFontId, color: string): Promise<Signature | null> {
  const name = text.trim()
  if (!name) return null
  const font = SCRIPT_FONTS.find((f) => f.id === fontId) ?? SCRIPT_FONTS[0]
  const px = Math.round(150 * font.scale)
  const spec = `${px}px "${font.family}"`
  await document.fonts.load(spec, name)

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.font = spec
  const m = ctx.measureText(name)
  const pad = Math.round(px * 0.18)
  const left = Math.ceil(m.actualBoundingBoxLeft)
  const width = Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight) + pad * 2
  const height = Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) + pad * 2
  canvas.width = width
  canvas.height = height
  ctx.font = spec
  ctx.fillStyle = color
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(name, pad + left, pad + Math.ceil(m.actualBoundingBoxAscent))
  return { id: uid('sig_'), kind: 'image', w: width, h: height, src: canvas.toDataURL('image/png'), color, source: 'type' }
}
