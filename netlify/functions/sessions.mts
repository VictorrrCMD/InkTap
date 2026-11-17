import { getStore } from '@netlify/blobs'
import type { Config, Context } from '@netlify/functions'

// Pairs the computer showing the QR with the phone that signs. Only ciphertext
// passes through: the AES key rides in the URL fragment, which browsers never send.

const TTL_MS = 10 * 60 * 1000
const ID = /^[A-Za-z0-9_-]{22}$/
const IV = /^[A-Za-z0-9_-]{16}$/
const B64URL = /^[A-Za-z0-9_-]+$/
const MAX_META = 4_000
const MAX_SIGNATURE = 400_000

interface Sealed {
  iv: string
  ct: string
}

interface Session {
  status: 'waiting' | 'opened' | 'signed'
  createdAt: number
  meta: Sealed
  signature?: Sealed
}

const reply = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
    },
  })

function isSealed(value: unknown, max: number): value is Sealed {
  if (!value || typeof value !== 'object') return false
  const { iv, ct } = value as Record<string, unknown>
  return (
    typeof iv === 'string' &&
    IV.test(iv) &&
    typeof ct === 'string' &&
    ct.length > 0 &&
    ct.length <= max &&
    B64URL.test(ct)
  )
}

async function readBody(req: Request, max: number): Promise<Record<string, unknown> | null> {
  const text = await req.text()
  if (!text || text.length > max + 200) return null
  try {
    const value = JSON.parse(text)
    return value && typeof value === 'object' ? value : null
  } catch {
    return null
  }
}

// Time left rather than a timestamp: the phone's and the computer's clocks
// needn't agree with the server's.
const view = (session: Session) => ({
  status: session.status,
  expiresIn: Math.max(0, session.createdAt + TTL_MS - Date.now()),
})

export default async (req: Request, context: Context) => {
  const { id, action } = context.params
  if (!id || !ID.test(id)) return reply(400, { error: 'bad-id' })

  const store = getStore({ name: 'sign-sessions', consistency: 'strong' })
  const method = req.method.toUpperCase()

  // The computer creates the session with its own random id.
  if (!action && method === 'PUT') {
    const body = await readBody(req, MAX_META)
    if (!body || !isSealed(body.meta, MAX_META)) return reply(400, { error: 'bad-body' })
    const session: Session = { status: 'waiting', createdAt: Date.now(), meta: body.meta }
    const result = await store.setJSON(id, session, { onlyIfNew: true })
    if (!result.modified) return reply(409, { error: 'exists' })
    return reply(201, view(session))
  }

  const entry = await store.getWithMetadata(id, { type: 'json' })
  if (!entry) return reply(404, { error: 'missing' })
  const session = entry.data as Session
  const etag = entry.etag

  if (Date.now() - session.createdAt > TTL_MS) {
    await store.delete(id)
    return reply(410, { error: 'expired' })
  }

  // The computer polls for the result.
  if (!action && method === 'GET') {
    return reply(200, { ...view(session), signature: session.signature })
  }

  // The computer discards the session once it has the signature, or gives up.
  if (!action && method === 'DELETE') {
    await store.delete(id)
    return reply(204)
  }

  // The phone opens the link: it gets the encrypted document name back.
  if (action === 'open' && method === 'POST') {
    if (session.status === 'signed') return reply(409, { error: 'signed' })
    if (session.status === 'waiting') {
      const next: Session = { ...session, status: 'opened' }
      await store.setJSON(id, next, etag ? { onlyIfMatch: etag } : undefined)
      return reply(200, { ...view(next), meta: session.meta })
    }
    return reply(200, { ...view(session), meta: session.meta })
  }

  // The phone sends the sealed signature, once.
  if (action === 'signature' && method === 'PUT') {
    if (session.status === 'signed') return reply(409, { error: 'signed' })
    const body = await readBody(req, MAX_SIGNATURE)
    if (!body || !isSealed(body.signature, MAX_SIGNATURE)) return reply(400, { error: 'bad-body' })
    const next: Session = { ...session, status: 'signed', signature: body.signature }
    const result = await store.setJSON(id, next, etag ? { onlyIfMatch: etag } : undefined)
    if (!result.modified) return reply(409, { error: 'signed' })
    return reply(200, view(next))
  }

  return reply(405, { error: 'method' })
}

export const config: Config = {
  path: ['/api/sessions/:id', '/api/sessions/:id/:action'],
  rateLimit: {
    windowLimit: 180,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
}
