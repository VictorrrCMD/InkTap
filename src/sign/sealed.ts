import { fromBase64Url, toBase64Url } from '../lib/bytes'

// AES-GCM with "purpose:sessionId" as associated data, so a sealed name can't
// pass for a signature, nor one session's signature for another's.

export interface Sealed {
  iv: string
  ct: string
}

type Purpose = 'meta' | 'signature'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function cryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle
}

export async function newKey(): Promise<{ key: CryptoKey; encoded: string }> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key))
  return { key, encoded: toBase64Url(raw) }
}

export async function importKey(encoded: string): Promise<CryptoKey> {
  const raw = fromBase64Url(encoded)
  if (raw.length !== 32) throw new Error('bad-key')
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function seal(key: CryptoKey, sessionId: string, purpose: Purpose, value: unknown): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = encoder.encode(JSON.stringify(value))
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(`${purpose}:${sessionId}`) },
    key,
    data,
  )
  return { iv: toBase64Url(iv), ct: toBase64Url(new Uint8Array(ct)) }
}

export async function unseal<T>(key: CryptoKey, sessionId: string, purpose: Purpose, sealed: Sealed): Promise<T> {
  const plain = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: fromBase64Url(sealed.iv),
      additionalData: encoder.encode(`${purpose}:${sessionId}`),
    },
    key,
    fromBase64Url(sealed.ct),
  )
  return JSON.parse(decoder.decode(plain)) as T
}
