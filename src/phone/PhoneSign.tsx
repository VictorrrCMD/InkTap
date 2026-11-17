import { ArrowCounterClockwise, CheckCircle, LockSimple, WarningCircle } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { INK_COLORS } from '../pdf/model'
import { openSession, SessionError, sendSignature } from '../sign/api'
import { hasInk } from '../sign/ink'
import { cryptoAvailable, importKey, seal, unseal } from '../sign/sealed'
import { SignaturePad, type PadHandle } from '../sign/SignaturePad'
import type { PhoneMeta, PhonePayload } from '../sign/usePhoneSession'

type State =
  | { phase: 'checking' }
  | { phase: 'ready'; key: CryptoKey; name: string }
  | { phase: 'sending'; key: CryptoKey; name: string }
  | { phase: 'sent' }
  | { phase: 'problem'; title: string; text: string }

function parseLink(): { id: string; key: string } | null {
  const match = location.pathname.match(/^\/s\/([A-Za-z0-9_-]{22})\/?$/)
  const key = location.hash.slice(1)
  if (!match || !/^[A-Za-z0-9_-]{43}$/.test(key)) return null
  return { id: match[1], key }
}

function problemFor(error: unknown): State {
  if (error instanceof SessionError) {
    if (error.reason === 'expired' || error.reason === 'missing') {
      return { phase: 'problem', title: 'Este código ya venció', text: 'En la computadora, abre de nuevo Con el celular para crear un código nuevo y escanéalo.' }
    }
    if (error.reason === 'signed') {
      return { phase: 'problem', title: 'Esta firma ya se envió', text: 'Cada código sirve para una sola firma. Si quieres cambiarla, crea otro código en la computadora.' }
    }
    if (error.reason === 'network') {
      return { phase: 'problem', title: 'Sin conexión', text: 'Revisa que tu celular tenga internet y vuelve a abrir el enlace.' }
    }
  }
  return { phase: 'problem', title: 'No pudimos abrir el enlace', text: 'Vuelve a escanear el código desde la computadora.' }
}

export default function PhoneSign() {
  const [state, setState] = useState<State>({ phase: 'checking' })
  const [strokes, setStrokes] = useState(0)
  const [sendError, setSendError] = useState('')
  const pad = useRef<PadHandle>(null)
  const link = useRef(parseLink())

  useEffect(() => {
    document.title = 'Firmar con eSign'
    const parsed = link.current
    if (!parsed) {
      setState({ phase: 'problem', title: 'Este enlace está incompleto', text: 'Vuelve a escanear el código QR que aparece en la computadora.' })
      return
    }
    if (!cryptoAvailable()) {
      setState({ phase: 'problem', title: 'No se puede firmar aquí', text: 'Este navegador no permite cifrar la firma en esta dirección. Ábrela con https.' })
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const key = await importKey(parsed.key)
        const view = await openSession(parsed.id)
        const meta = view.meta ? await unseal<PhoneMeta>(key, parsed.id, 'meta', view.meta) : null
        if (!cancelled) setState({ phase: 'ready', key, name: meta?.name ?? 'tu documento' })
      } catch (error) {
        if (!cancelled) setState(problemFor(error))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const send = async () => {
    if (state.phase !== 'ready' || !pad.current || !link.current) return
    const ink = pad.current.ink()
    if (!hasInk(ink)) return
    setSendError('')
    setState({ ...state, phase: 'sending' })
    try {
      const sealed = await seal(state.key, link.current.id, 'signature', { v: 1, ink } satisfies PhonePayload)
      await sendSignature(link.current.id, sealed)
      setState({ phase: 'sent' })
    } catch (error) {
      if (error instanceof SessionError && error.reason === 'network') {
        setSendError('No se pudo enviar. Revisa tu conexión y vuelve a tocar Enviar firma.')
        setState({ ...state, phase: 'ready' })
      } else setState(problemFor(error))
    }
  }

  return (
    <div className="phone-page">
      <header className="phone-page__bar">
        <span className="wordmark">eSign</span>
      </header>

      {state.phase === 'checking' ? (
        <main className="phone-page__center" role="status">
          <span className="spinner" aria-hidden />
          <p>Conectando con la computadora</p>
        </main>
      ) : null}

      {state.phase === 'ready' || state.phase === 'sending' ? (
        <main className="phone-page__sign">
          <div className="phone-page__head">
            <h1 className="phone-page__title">Firma aquí</h1>
            <p className="phone-page__doc">
              Para <strong>{state.name}</strong>
            </p>
          </div>
          <SignaturePad ref={pad} color={INK_COLORS.blue} label="Área para firmar con el dedo" hint="Firma con el dedo sobre la línea" onChange={setStrokes} className="phone-page__pad" />
          <p className="phone-page__tip">Gira el teléfono para tener más espacio.</p>
          {sendError ? (
            <p className="phone-page__error" role="alert">
              {sendError}
            </p>
          ) : null}
          <div className="phone-page__actions">
            <button type="button" className="btn btn-outline btn-lg" onClick={() => pad.current?.undo()} disabled={!strokes || state.phase === 'sending'}>
              <ArrowCounterClockwise size={20} aria-hidden />
              Deshacer
            </button>
            <button type="button" className="btn btn-outline btn-lg" onClick={() => pad.current?.clear()} disabled={!strokes || state.phase === 'sending'}>
              Borrar
            </button>
            <button type="button" className="btn btn-primary btn-lg phone-page__send" onClick={send} disabled={!strokes || state.phase === 'sending'}>
              {state.phase === 'sending' ? <span className="spinner" aria-hidden /> : null}
              Enviar firma
            </button>
          </div>
          <p className="phone-page__privacy">
            <LockSimple size={16} weight="fill" aria-hidden />
            La firma viaja cifrada; el servidor no puede verla.
          </p>
        </main>
      ) : null}

      {state.phase === 'sent' ? (
        <main className="phone-page__center phone-page__done" role="status">
          <CheckCircle size={56} weight="fill" className="phone-page__ok" aria-hidden />
          <h1 className="phone-page__title">Firma enviada</h1>
          <p>Ya puedes volver a la computadora: tu firma está lista para colocarla en el documento.</p>
        </main>
      ) : null}

      {state.phase === 'problem' ? (
        <main className="phone-page__center" role="alert">
          <WarningCircle size={48} weight="fill" className="phone-page__warn" aria-hidden />
          <h1 className="phone-page__title">{state.title}</h1>
          <p>{state.text}</p>
        </main>
      ) : null}
    </div>
  )
}
