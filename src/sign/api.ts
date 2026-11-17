import type { Sealed } from './sealed'

export type SessionStatus = 'waiting' | 'opened' | 'signed'

export interface SessionView {
  status: SessionStatus
  // Milliseconds left, by the server's clock.
  expiresIn: number
  meta?: Sealed
  signature?: Sealed
}

export class SessionError extends Error {
  constructor(
    public reason: 'missing' | 'expired' | 'signed' | 'network' | 'server',
    message: string = reason,
  ) {
    super(message)
  }
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...init.headers },
      cache: 'no-store',
    })
  } catch {
    throw new SessionError('network')
  }
  if (res.ok) return res
  if (res.status === 404) throw new SessionError('missing')
  if (res.status === 410) throw new SessionError('expired')
  if (res.status === 409) throw new SessionError('signed')
  throw new SessionError('server', `HTTP ${res.status}`)
}

export async function createSession(id: string, meta: Sealed): Promise<SessionView> {
  const res = await call(`/api/sessions/${id}`, { method: 'PUT', body: JSON.stringify({ meta }) })
  return res.json()
}

export async function readSession(id: string, signal?: AbortSignal): Promise<SessionView> {
  const res = await call(`/api/sessions/${id}`, { signal })
  return res.json()
}

export async function openSession(id: string): Promise<SessionView> {
  const res = await call(`/api/sessions/${id}/open`, { method: 'POST' })
  return res.json()
}

export async function sendSignature(id: string, signature: Sealed): Promise<void> {
  await call(`/api/sessions/${id}/signature`, { method: 'PUT', body: JSON.stringify({ signature }) })
}

export function discardSession(id: string): void {
  // Fire and forget; keepalive lets it finish while the dialog or tab closes.
  fetch(`/api/sessions/${id}`, { method: 'DELETE', keepalive: true }).catch(() => {})
}
