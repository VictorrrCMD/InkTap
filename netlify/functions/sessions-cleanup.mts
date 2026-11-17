import { getStore } from '@netlify/blobs'
import type { Config } from '@netlify/functions'

// Sessions are deleted when the computer picks the signature up; this sweeps
// the ones nobody finished (closed tab, never scanned).
const STALE_MS = 20 * 60 * 1000

export default async () => {
  const store = getStore({ name: 'sign-sessions', consistency: 'strong' })
  const { blobs } = await store.list()
  const now = Date.now()
  for (const { key } of blobs) {
    const session = (await store.get(key, { type: 'json' })) as { createdAt?: number } | null
    if (!session?.createdAt || now - session.createdAt > STALE_MS) await store.delete(key)
  }
}

export const config: Config = {
  schedule: '@hourly',
}
