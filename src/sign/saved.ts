import type { Signature } from '../pdf/model'

// Signatures the person chose to keep, in this browser only.
const KEY = 'esign:signatures'
const LIMIT = 4

function valid(value: unknown): value is Signature {
  const s = value as Signature
  return !!s && typeof s.id === 'string' && (s.kind === 'ink' || s.kind === 'image') && s.w > 0 && s.h > 0
}

export function loadSaved(): Signature[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter(valid).slice(0, LIMIT) : []
  } catch {
    return []
  }
}

function write(list: Signature[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, LIMIT)))
    return true
  } catch {
    return false
  }
}

export function keepSignature(signature: Signature): boolean {
  return write([signature, ...loadSaved().filter((s) => s.id !== signature.id)])
}

export function forgetSignature(id: string): void {
  write(loadSaved().filter((s) => s.id !== id))
}
