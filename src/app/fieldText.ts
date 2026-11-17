import type { Field } from '../pdf/model'

// pdf.js reports "auto" sizes already resolved (69pt in a tall box), so the
// editor picks a readable size and the export writes that same size.
const SINGLE_MAX = 12
const MULTI_MAX = 10
const MIN = 6
const PAD = 2

let ctx: CanvasRenderingContext2D | null = null

// Helvetica and Arial share advance widths, so the browser's Arial measures
// what pdf-lib's Helvetica will draw.
function widthAt1pt(text: string): number {
  ctx ??= document.createElement('canvas').getContext('2d')
  if (!ctx) return text.length * 0.55
  ctx.font = '1000px Helvetica, Arial, "Liberation Sans", sans-serif'
  return ctx.measureText(text).width / 1000
}

// The field's own width and height, before the page's rotation: on a page
// turned 90 degrees the box on screen is tall, the field itself is wide.
export function fieldSize(field: Field) {
  const [x1, y1, x2, y2] = field.pdfRect
  return { w: x2 - x1, h: y2 - y1 }
}

export function baseFontSize(field: Field): number {
  const { h } = fieldSize(field)
  const reported = field.fontSize && field.fontSize > 0 ? field.fontSize : h * 0.6
  if (field.multiline) return Math.max(MIN, Math.min(reported, MULTI_MAX))
  return Math.max(MIN, Math.min(reported, h * 0.72, SINGLE_MAX))
}

export function fitFontSize(field: Field, value: string): number {
  const base = baseFontSize(field)
  if (field.multiline || field.comb || !value) return base
  const { w } = fieldSize(field)
  const needed = widthAt1pt(value) * base + PAD * 2
  if (needed <= w) return base
  return Math.max(MIN, Math.floor(((w - PAD * 2) / widthAt1pt(value)) * 10) / 10)
}
