import type { Signature } from '../pdf/model'
import { turnedSize } from '../pdf/turn'
import { traceImageSignature } from './photo'

export type SignatureFormat = 'svg' | 'png'

// The longest side of a downloaded PNG, in pixels.
const PNG_SIDE = 1600

const fixed = (n: number) => Math.round(n * 10) / 10

async function vector(sig: Signature): Promise<{ paths: string[]; w: number; h: number }> {
  if (sig.kind === 'ink' && sig.paths) return { paths: sig.paths, w: sig.w, h: sig.h }
  if (sig.src) {
    const traced = await traceImageSignature(sig.src, sig.color)
    return { paths: traced.paths ?? [], w: traced.w, h: traced.h }
  }
  throw new Error('empty-signature')
}

// The signature as it looks on the page: its color, turned by `rotation`.
function svgMarkup(paths: string[], w: number, h: number, color: string, rotation: number) {
  const box = turnedSize(w, h, rotation)
  const W = fixed(box.w)
  const H = fixed(box.h)
  const place = rotation ? ` transform="translate(${fixed(W / 2)} ${fixed(H / 2)}) rotate(${rotation}) translate(${fixed(-w / 2)} ${fixed(-h / 2)})"` : ''
  const body = paths.map((d) => `<path d="${d}"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><g fill="${color}"${place}>${body}</g></svg>\n`
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image'))
    img.src = url
  })
}

async function pngOf(source: string, w: number, h: number, rotation: number, scale: number): Promise<Blob> {
  const img = await loadImage(source)
  const box = turnedSize(w, h, rotation)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(box.w * scale))
  canvas.height = Math.max(1, Math.round(box.h * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no-canvas')
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((rotation * Math.PI) / 180)
  ctx.drawImage(img, (-w * scale) / 2, (-h * scale) / 2, w * scale, h * scale)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png'))
}

export async function signatureFile(sig: Signature, rotation: number, format: SignatureFormat): Promise<Blob> {
  if (format === 'png' && sig.kind === 'image' && sig.src) {
    // The typed signature already is a picture; turn it at its own resolution.
    return pngOf(sig.src, sig.w, sig.h, rotation, 1)
  }
  const { paths, w, h } = await vector(sig)
  if (format === 'svg') return new Blob([svgMarkup(paths, w, h, sig.color, rotation)], { type: 'image/svg+xml' })
  const upright = svgMarkup(paths, w, h, sig.color, 0)
  const url = URL.createObjectURL(new Blob([upright], { type: 'image/svg+xml' }))
  try {
    return await pngOf(url, w, h, rotation, PNG_SIDE / Math.max(w, h))
  } finally {
    URL.revokeObjectURL(url)
  }
}
