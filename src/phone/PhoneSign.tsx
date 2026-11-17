import { ArrowCounterClockwise, Camera, CheckCircle, DeviceMobile, ImageSquare, LockSimple, PencilSimple, WarningCircle, X } from '@phosphor-icons/react'
import { useEffect, useRef, useState, type Ref } from 'react'
import { shrinkPhoto } from '../sign/photo'
import { Segmented } from '../ui/Segmented'
import { INK_COLORS } from '../pdf/model'
import { openSession, SessionError, sendSignature } from '../sign/api'
import { hasInk } from '../sign/ink'
import { cryptoAvailable, importKey, seal, unseal } from '../sign/sealed'
import { SignaturePad, type PadHandle } from '../sign/SignaturePad'
import type { PhoneMeta, PhonePayload } from '../sign/usePhoneSession'
import { Logo } from '../ui/Logo'
import { LegalLinks } from '../legal/LegalLinks'
import { TOOL_NOTICE } from '../legal/owner'

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

const LANDSCAPE = '(orientation: landscape)'

function useLandscape() {
  const [landscape, setLandscape] = useState(() => window.matchMedia(LANDSCAPE).matches)
  useEffect(() => {
    const query = window.matchMedia(LANDSCAPE)
    const update = () => setLandscape(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return landscape
}

type Turnable = ScreenOrientation & { lock?: (to: 'landscape') => Promise<void>; unlock?: () => void }
const orientation = () => screen.orientation as Turnable | undefined
// Android can go full screen and turn itself; iPhone Safari can do neither.
const canTurnScreen = () => document.fullscreenEnabled && typeof orientation()?.lock === 'function'

async function goFullScreen(turn: boolean) {
  try {
    if (document.fullscreenEnabled && !document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' })
    if (turn && document.fullscreenElement) await orientation()?.lock?.('landscape')
  } catch {
    // The stage covers the screen either way.
  }
}

function leaveFullScreen() {
  try {
    orientation()?.unlock?.()
  } catch {
    // Nothing was locked.
  }
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
}

function TurnPrompt({ landscape, started, onOpen }: { landscape: boolean; started: boolean; onOpen: (turn: boolean) => void }) {
  const turnable = canTurnScreen()
  return (
    <div className="phone-turn">
      <span className="phone-turn__art" data-landscape={landscape} aria-hidden>
        <DeviceMobile size={56} />
      </span>
      {landscape ? (
        <>
          <h2 className="phone-turn__title">{started ? 'Tu firma sigue aquí' : 'Firma en pantalla completa'}</h2>
          <p className="phone-turn__text">El área para firmar ocupa toda la pantalla.</p>
          <button type="button" className="btn btn-primary btn-lg" onClick={() => onOpen(false)}>
            {started ? 'Seguir firmando' : 'Abrir área de firma'}
          </button>
        </>
      ) : (
        <>
          <h2 className="phone-turn__title">Gira tu celular</h2>
          <p className="phone-turn__text">En horizontal, el área para firmar ocupa toda la pantalla.</p>
          {turnable ? (
            <button type="button" className="btn btn-primary btn-lg" onClick={() => onOpen(true)}>
              Girar la pantalla
            </button>
          ) : null}
          <button type="button" className="btn btn-outline btn-lg" onClick={() => onOpen(false)}>
            {started ? 'Seguir firmando' : 'Firmar en vertical'}
          </button>
        </>
      )}
    </div>
  )
}

interface StageProps {
  open: boolean
  name: string
  sending: boolean
  error: string
  strokes: number
  padRef: Ref<PadHandle>
  onStrokes: (count: number) => void
  onUndo: () => void
  onClear: () => void
  onUse: () => void
  onClose: () => void
}

// Stays mounted while hidden, so closing it or turning the phone keeps the strokes.
function SignStage({ open, name, sending, error, strokes, padRef, onStrokes, onUndo, onClear, onUse, onClose }: StageProps) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    box.current?.focus()
    const root = document.documentElement
    const before = root.style.overflow
    root.style.overflow = 'hidden'
    return () => {
      root.style.overflow = before
    }
  }, [open])
  return (
    <div
      ref={box}
      className="phone-stage"
      data-open={open}
      role="dialog"
      aria-modal="true"
      aria-label="Firma en pantalla completa"
      tabIndex={-1}
      inert={!open}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div className="phone-stage__bar">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Salir de pantalla completa">
          <X size={22} aria-hidden />
        </button>
        <p className="phone-stage__doc">
          Para <strong>{name}</strong>
        </p>
        <button type="button" className="btn btn-quiet phone-stage__undo" onClick={onUndo} disabled={!strokes || sending} aria-label="Deshacer">
          <ArrowCounterClockwise size={20} aria-hidden />
          <span>Deshacer</span>
        </button>
        <button type="button" className="btn btn-quiet" onClick={onClear} disabled={!strokes || sending}>
          Borrar
        </button>
        <button type="button" className="btn btn-primary" onClick={onUse} disabled={!strokes || sending}>
          {sending ? <span className="spinner" aria-hidden /> : null}
          Usar firma
        </button>
      </div>
      {error ? (
        <p className="phone-stage__error" role="alert">
          {error}
        </p>
      ) : null}
      <SignaturePad ref={padRef} color={INK_COLORS.blue} label="Área para firmar con el dedo" hint="Firma con el dedo sobre la línea" onChange={onStrokes} className="phone-stage__pad" />
    </div>
  )
}

// The photo is shrunk here before it travels; the computer removes the
// background and traces it, so it can be adjusted on the bigger screen.
function PhotoPick({ photo, onPhoto, onError }: { photo: string | null; onPhoto: (p: string | null) => void; onError: (m: string) => void }) {
  const shoot = useRef<HTMLInputElement>(null)
  const pick = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const take = async (file?: File) => {
    if (!file) return
    setBusy(true)
    onError('')
    try {
      onPhoto(await shrinkPhoto(file))
    } catch {
      onError('No pudimos leer esa imagen. Prueba con otra foto.')
    } finally {
      setBusy(false)
    }
  }
  const input = (ref: typeof shoot, capture: boolean) => (
    <input
      ref={ref}
      type="file"
      accept="image/*"
      capture={capture ? 'environment' : undefined}
      hidden
      onChange={(e) => {
        void take(e.target.files?.[0])
        e.target.value = ''
      }}
    />
  )
  return (
    <div className="phone-photo">
      {input(shoot, true)}
      {input(pick, false)}
      {photo ? (
        <>
          <img src={photo} alt="Foto de tu firma" className="phone-photo__preview" />
          <button type="button" className="btn btn-quiet" onClick={() => onPhoto(null)}>
            Tomar otra
          </button>
        </>
      ) : (
        <>
          <p className="phone-photo__lead">Firma en una hoja blanca y tómale una foto de cerca, con buena luz.</p>
          <button type="button" className="btn btn-outline btn-lg" onClick={() => shoot.current?.click()} disabled={busy}>
            {busy ? <span className="spinner" aria-hidden /> : <Camera size={20} aria-hidden />}
            Tomar foto
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => pick.current?.click()} disabled={busy}>
            <ImageSquare size={20} aria-hidden />
            Elegir de la galería
          </button>
        </>
      )}
    </div>
  )
}

export default function PhoneSign() {
  const [state, setState] = useState<State>({ phase: 'checking' })
  const [strokes, setStrokes] = useState(0)
  const [sendError, setSendError] = useState('')
  const pad = useRef<PadHandle>(null)
  const link = useRef(parseLink())
  const [mode, setMode] = useState<'draw' | 'photo'>('draw')
  const [photo, setPhoto] = useState<string | null>(null)
  const landscape = useLandscape()
  const [stage, setStage] = useState(false)
  const signing = state.phase === 'ready' || state.phase === 'sending'

  // Turning the phone sideways opens the full-screen pad; closing it there keeps it closed.
  const sideways = landscape && signing && mode === 'draw'
  const wasSideways = useRef(false)
  useEffect(() => {
    if (sideways && !wasSideways.current) setStage(true)
    wasSideways.current = sideways
  }, [sideways])

  useEffect(() => {
    if (state.phase === 'sent' || state.phase === 'problem') leaveFullScreen()
  }, [state.phase])

  const openStage = (turn: boolean) => {
    void goFullScreen(turn)
    setStage(true)
  }
  const closeStage = () => {
    setStage(false)
    leaveFullScreen()
  }

  useEffect(() => {
    document.title = 'Firmar con InkTap'
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
    if (state.phase !== 'ready' || !link.current) return
    let payload: PhonePayload
    if (mode === 'photo') {
      if (!photo) return
      payload = { v: 1, photo }
    } else {
      const ink = pad.current?.ink()
      if (!hasInk(ink)) return
      payload = { v: 1, ink }
    }
    setSendError('')
    setState({ ...state, phase: 'sending' })
    try {
      const sealed = await seal(state.key, link.current.id, 'signature', payload)
      await sendSignature(link.current.id, sealed)
      setState({ phase: 'sent' })
    } catch (error) {
      if (error instanceof SessionError && error.reason === 'network') {
        setSendError(`No se pudo enviar. Revisa tu conexión y vuelve a tocar ${mode === 'photo' ? 'Usar foto' : 'Usar firma'}.`)
        setState({ ...state, phase: 'ready' })
      } else setState(problemFor(error))
    }
  }

  return (
    <div className="phone-page">
      <header className="phone-page__bar" inert={stage && signing}>
        <Logo />
      </header>

      {state.phase === 'checking' ? (
        <main className="phone-page__center" role="status">
          <span className="spinner" aria-hidden />
          <p>Conectando con la computadora</p>
        </main>
      ) : null}

      {state.phase === 'ready' || state.phase === 'sending' ? (
        <main className="phone-page__sign" inert={stage}>
          <div className="phone-page__head">
            <h1 className="phone-page__title">Firma aquí</h1>
            <p className="phone-page__doc">
              Para <strong>{state.name}</strong>
            </p>
          </div>
          <Segmented
            label="Cómo quieres firmar"
            value={mode}
            onChange={setMode}
            className="phone-page__modes"
            options={[
              { value: 'draw', label: 'Dibujar', icon: <PencilSimple size={18} weight="bold" aria-hidden /> },
              { value: 'photo', label: 'Foto', icon: <Camera size={18} weight="bold" aria-hidden /> },
            ]}
          />
          {mode === 'draw' ? (
            <TurnPrompt landscape={landscape} started={strokes > 0} onOpen={openStage} />
          ) : (
            <PhotoPick photo={photo} onPhoto={setPhoto} onError={setSendError} />
          )}
          {sendError ? (
            <p className="phone-page__error" role="alert">
              {sendError}
            </p>
          ) : null}
          {mode === 'photo' || strokes > 0 ? (
            <button
              type="button"
              className="btn btn-primary btn-lg phone-page__send"
              onClick={send}
              disabled={(mode === 'draw' ? !strokes : !photo) || state.phase === 'sending'}
            >
              {state.phase === 'sending' ? <span className="spinner" aria-hidden /> : null}
              {mode === 'draw' ? 'Usar firma' : 'Usar foto'}
            </button>
          ) : null}
          <p className="phone-page__privacy">
            <LockSimple size={16} weight="fill" aria-hidden />
            La firma viaja cifrada; el servidor no puede verla.
          </p>
        </main>
      ) : null}

      {(state.phase === 'ready' || state.phase === 'sending') && mode === 'draw' ? (
        <SignStage
          open={stage}
          name={state.name}
          sending={state.phase === 'sending'}
          error={sendError}
          strokes={strokes}
          padRef={pad}
          onStrokes={setStrokes}
          onUndo={() => pad.current?.undo()}
          onClear={() => pad.current?.clear()}
          onUse={send}
          onClose={closeStage}
        />
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

      <footer className="phone-page__foot">
        <p>{TOOL_NOTICE}</p>
        <LegalLinks newTab className="phone-page__legal" />
      </footer>
    </div>
  )
}
