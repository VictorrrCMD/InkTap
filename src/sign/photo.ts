import { uid } from '../lib/bytes'
import type { Signature } from '../pdf/model'

// A photo of a signature becomes vector ink: flatten the lighting, keep what
// is darker than its surroundings, drop specks, crop, then trace with potrace.

const MAX_SIDE = 1400

export interface PhotoSource {
  width: number
  height: number
  gray: Uint8ClampedArray
  // Local paper brightness, so a shadow across the sheet isn't read as ink.
  paper: Float32Array
  rgb: Uint8ClampedArray
}

export interface PhotoParams {
  // 0..1: higher keeps fainter strokes.
  sensitivity: number
  // Whole pixels to grow (+) or thin (-) the strokes before tracing.
  weight: number
}

export interface PhotoInk {
  mask: Uint8Array
  width: number
  height: number
  inkColor: 'blue' | 'black'
}

export class NoSignatureFound extends Error {
  constructor() {
    super('no-signature')
  }
}

export async function loadPhoto(file: Blob): Promise<PhotoSource> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('no-canvas')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const rgb = ctx.getImageData(0, 0, width, height).data
  const gray = new Uint8ClampedArray(width * height)
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) gray[i] = (rgb[p] * 299 + rgb[p + 1] * 587 + rgb[p + 2] * 114) / 1000
  return { width, height, gray, rgb, paper: localBrightness(gray, width, height, Math.max(8, Math.round(Math.max(width, height) / 24))) }
}

// Box blur through an integral image: the paper's brightness around each pixel.
function localBrightness(gray: Uint8ClampedArray, w: number, h: number, r: number): Float32Array {
  const sum = new Float64Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) {
    let row = 0
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x]
      sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + row
    }
  }
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r)
    const y1 = Math.min(h, y + r + 1)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r)
      const x1 = Math.min(w, x + r + 1)
      const total = sum[y1 * (w + 1) + x1] - sum[y0 * (w + 1) + x1] - sum[y1 * (w + 1) + x0] + sum[y0 * (w + 1) + x0]
      out[y * w + x] = total / ((x1 - x0) * (y1 - y0))
    }
  }
  return out
}

export function extractInk(src: PhotoSource, params: PhotoParams): PhotoInk {
  const { width: w, height: h, gray, paper } = src
  const cut = 0.32 - params.sensitivity * 0.26
  let mask: Uint8Array = new Uint8Array(w * h)
  for (let i = 0; i < mask.length; i++) {
    const darkness = 1 - gray[i] / Math.max(paper[i], 1)
    mask[i] = darkness > cut && gray[i] < 225 ? 1 : 0
  }
  despeckle(mask, w, Math.round(w * h * 0.00004) + 12)

  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0 || maxX - minX < 8 || maxY - minY < 4) throw new NoSignatureFound()

  const pad = 6 + Math.max(0, params.weight)
  const cw = maxX - minX + 1 + pad * 2
  const ch = maxY - minY + 1 + pad * 2
  const cropped = new Uint8Array(cw * ch)
  let r = 0
  let b = 0
  let n = 0
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const i = y * w + x
      if (!mask[i]) continue
      cropped[(y - minY + pad) * cw + (x - minX + pad)] = 1
      r += src.rgb[i * 4]
      b += src.rgb[i * 4 + 2]
      n++
    }
  }
  mask = cropped
  for (let step = 0; step < Math.abs(params.weight); step++) mask = morph(mask, cw, ch, params.weight > 0)
  return { mask, width: cw, height: ch, inkColor: b / n > (r / n) * 1.15 ? 'blue' : 'black' }
}

// Connected groups of ink smaller than `min` pixels are dust, not strokes.
function despeckle(mask: Uint8Array, w: number, min: number) {
  const seen = new Uint8Array(mask.length)
  const stack: number[] = []
  const group: number[] = []
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue
    stack.push(start)
    seen[start] = 1
    group.length = 0
    while (stack.length) {
      const i = stack.pop()!
      group.push(i)
      const x = i % w
      const neighbors = [i - w, i + w, x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1]
      for (const j of neighbors) {
        if (j >= 0 && j < mask.length && mask[j] && !seen[j]) {
          seen[j] = 1
          stack.push(j)
        }
      }
    }
    if (group.length < min) for (const i of group) mask[i] = 0
  }
}

// One pixel of dilation (grow) or erosion (thin) with a plus-shaped kernel.
function morph(mask: Uint8Array, w: number, h: number, grow: boolean): Uint8Array {
  const out = new Uint8Array(mask.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const c = mask[i]
      const l = x > 0 ? mask[i - 1] : 0
      const rr = x < w - 1 ? mask[i + 1] : 0
      const u = y > 0 ? mask[i - w] : 0
      const d = y < h - 1 ? mask[i + w] : 0
      out[i] = grow ? c | l | rr | u | d : c & l & rr & u & d
    }
  }
  return out
}

let ready: Promise<typeof import('esm-potrace-wasm')> | null = null

function potraceModule() {
  ready ??= import('esm-potrace-wasm').then(async (mod) => {
    await mod.init()
    return mod
  })
  return ready
}

export async function traceInk(ink: PhotoInk, color: string): Promise<Signature> {
  const { potrace } = await potraceModule()
  const image = new ImageData(ink.width, ink.height)
  for (let i = 0; i < ink.mask.length; i++) {
    const v = ink.mask[i] ? 0 : 255
    image.data[i * 4] = v
    image.data[i * 4 + 1] = v
    image.data[i * 4 + 2] = v
    image.data[i * 4 + 3] = 255
  }
  const traced = await potrace(image, { turdsize: 2, turnpolicy: 4, alphamax: 1, opticurve: 1, opttolerance: 0.2, pathonly: true, extractcolors: false })
  const paths = (Array.isArray(traced) ? traced : [traced]).map((d) => fromPotrace(String(d), ink.height)).filter(Boolean)
  if (!paths.length) throw new NoSignatureFound()
  return { id: uid('sig_'), kind: 'ink', w: ink.width, h: ink.height, paths, color, source: 'photo' }
}

// Potrace writes tenths of a pixel with y pointing up; rewrite as absolute
// pixel coordinates with y pointing down.
export function fromPotrace(d: string, height: number): string {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? []
  let out = ''
  let cmd = ''
  let x = 0
  let y = 0
  let startX = 0
  let startY = 0
  let i = 0
  const num = () => Number(tokens[i++]) / 10
  const pt = (px: number, py: number) => `${Math.round(px * 10) / 10} ${Math.round((height - py) * 10) / 10}`
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++]
    switch (cmd) {
      case 'M':
      case 'm': {
        const nx = num()
        const ny = num()
        x = cmd === 'm' ? x + nx : nx
        y = cmd === 'm' ? y + ny : ny
        startX = x
        startY = y
        out += `M${pt(x, y)}`
        cmd = cmd === 'm' ? 'l' : 'L'
        break
      }
      case 'L':
      case 'l': {
        const nx = num()
        const ny = num()
        x = cmd === 'l' ? x + nx : nx
        y = cmd === 'l' ? y + ny : ny
        out += `L${pt(x, y)}`
        break
      }
      case 'C':
      case 'c': {
        const rel = cmd === 'c'
        const c1x = num() + (rel ? x : 0)
        const c1y = num() + (rel ? y : 0)
        const c2x = num() + (rel ? x : 0)
        const c2y = num() + (rel ? y : 0)
        const ex = num() + (rel ? x : 0)
        const ey = num() + (rel ? y : 0)
        out += `C${pt(c1x, c1y)} ${pt(c2x, c2y)} ${pt(ex, ey)}`
        x = ex
        y = ey
        break
      }
      case 'Z':
      case 'z':
        out += 'Z'
        x = startX
        y = startY
        cmd = ''
        break
      default:
        i++
    }
  }
  return out
}

// What the phone sends: the photo downscaled and re-encoded, small enough to
// travel sealed through the session.
export async function shrinkPhoto(file: Blob, maxSide = 1600): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.85)
}

export function dataUrlToBlob(url: string): Blob {
  const [head, body] = url.split(',')
  const type = head.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg'
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type })
}
