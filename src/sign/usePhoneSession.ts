import { useEffect, useState } from 'react'
import { toBase64Url } from '../lib/bytes'
import { createSession, discardSession, readSession, SessionError } from './api'
import { hasInk, type Ink } from './ink'
import { cryptoAvailable, newKey, seal, unseal } from './sealed'

export interface PhoneMeta {
  v: 1
  name: string
}

export interface PhonePayload {
  v: 1
  ink: Ink
}

export type PhoneState =
  | { phase: 'creating' }
  | { phase: 'waiting' | 'opened'; url: string; expiresAt: number }
  | { phase: 'received'; ink: Ink }
  | { phase: 'expired' }
  | { phase: 'error'; reason: 'network' | 'crypto' | 'server' }

const POLL_MS = 1500
const HIDDEN_POLL_MS = 5000

export function usePhoneSession(active: boolean, docName: string) {
  const [state, setState] = useState<PhoneState>({ phase: 'creating' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!active) return
    if (!cryptoAvailable()) {
      setState({ phase: 'error', reason: 'crypto' })
      return
    }
    let stopped = false
    let finished = false
    let timer = 0
    let sessionId: string | null = null
    const controller = new AbortController()
    setState({ phase: 'creating' })

    const poll = async (id: string, key: CryptoKey, expiresAt: number) => {
      if (stopped) return
      if (Date.now() > expiresAt) {
        setState({ phase: 'expired' })
        return
      }
      try {
        const view = await readSession(id, controller.signal)
        if (stopped) return
        if (view.status === 'signed' && view.signature) {
          const payload = await unseal<PhonePayload>(key, id, 'signature', view.signature)
          finished = true
          discardSession(id)
          setState(hasInk(payload.ink) ? { phase: 'received', ink: payload.ink } : { phase: 'error', reason: 'server' })
          return
        }
        const phase = view.status === 'opened' ? 'opened' : 'waiting'
        setState((prev) => (prev.phase === 'waiting' || prev.phase === 'opened') && prev.phase !== phase ? { ...prev, phase } : prev)
      } catch (error) {
        if (stopped) return
        if (error instanceof SessionError && (error.reason === 'expired' || error.reason === 'missing')) {
          setState({ phase: 'expired' })
          return
        }
        if (!(error instanceof SessionError)) {
          // The ciphertext didn't open: not from this session's phone.
          setState({ phase: 'error', reason: 'server' })
          return
        }
        // A dropped request: keep polling, the next one may get through.
      }
      timer = window.setTimeout(() => poll(id, key, expiresAt), document.hidden ? HIDDEN_POLL_MS : POLL_MS)
    }

    ;(async () => {
      try {
        const { key, encoded } = await newKey()
        const id = toBase64Url(crypto.getRandomValues(new Uint8Array(16)))
        const meta = await seal(key, id, 'meta', { v: 1, name: docName } satisfies PhoneMeta)
        const view = await createSession(id, meta)
        if (stopped) {
          discardSession(id)
          return
        }
        sessionId = id
        const expiresAt = Date.now() + view.expiresIn
        setState({ phase: 'waiting', url: `${location.origin}/s/${id}#${encoded}`, expiresAt })
        timer = window.setTimeout(() => poll(id, key, expiresAt), POLL_MS)
      } catch (error) {
        if (stopped) return
        setState({ phase: 'error', reason: error instanceof SessionError && error.reason === 'network' ? 'network' : 'server' })
      }
    })()

    return () => {
      stopped = true
      controller.abort()
      clearTimeout(timer)
      if (sessionId && !finished) discardSession(sessionId)
    }
  }, [active, attempt, docName])

  return { state, restart: () => setAttempt((n) => n + 1) }
}
