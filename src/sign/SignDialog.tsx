import '@fontsource/caveat/500.css'
import '@fontsource/great-vibes/400.css'
import '@fontsource/homemade-apple/400.css'
import { ArrowClockwise, ArrowCounterClockwise, Copy, DeviceMobile, PencilSimple, TextAa, Trash, X } from '@phosphor-icons/react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { INK_COLORS, type InkColor, type Signature } from '../pdf/model'
import { Dialog } from '../ui/Dialog'
import { Segmented } from '../ui/Segmented'
import { inkToSignature, SCRIPT_FONTS, typedSignature, type Ink, type ScriptFontId } from './ink'
import { QrCode } from './QrCode'
import { forgetSignature, keepSignature, loadSaved } from './saved'
import { SignatureArt } from './SignatureArt'
import { SignaturePad, type PadHandle } from './SignaturePad'
import { usePhoneSession, type PhoneState } from './usePhoneSession'

type Tab = 'saved' | 'draw' | 'type' | 'phone'

interface Props {
  open: boolean
  docName: string
  session: Signature | null
  onClose: () => void
  onPick: (signature: Signature) => void
}

const canUsePhone = () => typeof window !== 'undefined' && window.matchMedia('(any-pointer: fine)').matches

export function SignDialog({ open, docName, session, onClose, onPick }: Props) {
  const titleId = useId()
  return (
    <Dialog open={open} onClose={onClose} labelledBy={titleId} className="sign-dialog">
      <SignBody titleId={titleId} docName={docName} session={session} onClose={onClose} onPick={onPick} />
    </Dialog>
  )
}

function SignBody({ titleId, docName, session, onClose, onPick }: Omit<Props, 'open'> & { titleId: string }) {
  const [saved, setSaved] = useState<Signature[]>(loadSaved)
  const reuse = useMemo(() => {
    const list = [...saved]
    if (session && !list.some((s) => s.id === session.id)) list.unshift(session)
    return list
  }, [saved, session])
  const phoneAllowed = useMemo(canUsePhone, [])
  const [tab, setTab] = useState<Tab>(reuse.length ? 'saved' : 'draw')
  const [color, setColor] = useState<InkColor>('blue')
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)

  const pad = useRef<PadHandle>(null)
  const [strokes, setStrokes] = useState(0)
  const [name, setName] = useState('')
  const [font, setFont] = useState<ScriptFontId>('formal')
  const [phoneInk, setPhoneInk] = useState<Ink | null>(null)

  const tabs = [
    ...(reuse.length ? [{ value: 'saved' as const, label: 'Guardadas' }] : []),
    { value: 'draw' as const, label: 'Dibujar', icon: <PencilSimple size={16} weight="bold" aria-hidden /> },
    { value: 'type' as const, label: 'Escribir', icon: <TextAa size={16} weight="bold" aria-hidden /> },
    ...(phoneAllowed ? [{ value: 'phone' as const, label: 'Con el celular', icon: <DeviceMobile size={16} weight="bold" aria-hidden /> }] : []),
  ]

  const ready = (tab === 'draw' && strokes > 0) || (tab === 'type' && name.trim().length > 0) || (tab === 'phone' && !!phoneInk)

  const finish = async () => {
    if (!ready || busy) return
    setBusy(true)
    const ink = INK_COLORS[color]
    let signature: Signature | null = null
    if (tab === 'draw' && pad.current) signature = inkToSignature(pad.current.ink(), ink, 'draw')
    if (tab === 'type') signature = await typedSignature(name, font, ink)
    if (tab === 'phone' && phoneInk) signature = inkToSignature(phoneInk, ink, 'phone')
    setBusy(false)
    if (!signature) return
    if (remember) keepSignature(signature)
    onPick(signature)
  }

  const panelId = (value: Tab) => `${titleId}-panel-${value}`

  return (
    <form
      className="sign"
      onSubmit={(e) => {
        e.preventDefault()
        void finish()
      }}
    >
      <header className="sign__head">
        <div className="sign__title" id={titleId}>
          Tu firma
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
          <X size={20} aria-hidden />
        </button>
      </header>

      <Segmented label="Cómo quieres firmar" role="tabs" value={tab} options={tabs} onChange={setTab} panelId={panelId} className="sign__tabs" />

      <div className="sign__panel" role="tabpanel" id={panelId(tab)} aria-label={tabs.find((t) => t.value === tab)?.label}>
        {tab === 'saved' ? (
          <SavedPanel
            list={reuse}
            sessionId={session && !saved.some((s) => s.id === session.id) ? session.id : null}
            onUse={onPick}
            onForget={(id) => {
              forgetSignature(id)
              const next = loadSaved()
              setSaved(next)
              if (!next.length && !session) setTab('draw')
            }}
          />
        ) : null}

        {tab === 'draw' ? (
          <div className="draw">
            <SignaturePad ref={pad} color={INK_COLORS[color]} label="Área para dibujar tu firma" hint="Firma sobre la línea" onChange={setStrokes} className="draw__pad" />
            <div className="sign__row">
              <InkPicker color={color} onChange={setColor} />
              <div className="sign__row-end">
                <button type="button" className="btn btn-quiet" onClick={() => pad.current?.undo()} disabled={strokes === 0}>
                  <ArrowCounterClockwise size={18} aria-hidden />
                  Deshacer
                </button>
                <button type="button" className="btn btn-quiet" onClick={() => pad.current?.clear()} disabled={strokes === 0}>
                  Borrar
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'type' ? <TypePanel name={name} onName={setName} font={font} onFont={setFont} color={color} onColor={setColor} /> : null}

        {tab === 'phone' ? <PhonePanel docName={docName} color={color} onColor={setColor} ink={phoneInk} onInk={setPhoneInk} /> : null}
      </div>

      {tab !== 'saved' ? (
        <footer className="sign__foot">
          <label className="check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>Recordar en este navegador</span>
          </label>
          <div className="sign__actions">
            <button type="button" className="btn btn-quiet" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={!ready || busy}>
              {busy ? <span className="spinner" aria-hidden /> : null}
              Usar firma
            </button>
          </div>
        </footer>
      ) : null}
    </form>
  )
}

function InkPicker({ color, onChange }: { color: InkColor; onChange: (c: InkColor) => void }) {
  return (
    <div className="ink-picker">
      <span className="ink-picker__label" aria-hidden>
        Tinta
      </span>
      <Segmented
        label="Color de tinta"
        size="sm"
        value={color}
        onChange={onChange}
        options={[
          { value: 'blue', label: 'Azul', icon: <span className="ink-dot" style={{ background: INK_COLORS.blue }} aria-hidden /> },
          { value: 'black', label: 'Negra', icon: <span className="ink-dot" style={{ background: INK_COLORS.black }} aria-hidden /> },
        ]}
      />
    </div>
  )
}

function SavedPanel({ list, sessionId, onUse, onForget }: { list: Signature[]; sessionId: string | null; onUse: (s: Signature) => void; onForget: (id: string) => void }) {
  return (
    <ul className="saved" aria-label="Firmas para reutilizar">
      {list.map((signature) => (
        <li key={signature.id} className="saved__item">
          <button type="button" className="saved__use" onClick={() => onUse(signature)} aria-label={signature.id === sessionId ? 'Usar la firma de esta sesión' : 'Usar esta firma guardada'}>
            <SignatureArt signature={signature} className="saved__art" />
          </button>
          <div className="saved__meta">
            <span>{signature.id === sessionId ? 'De esta sesión' : 'Guardada en este navegador'}</span>
            {signature.id !== sessionId ? (
              <button type="button" className="icon-btn saved__forget" onClick={() => onForget(signature.id)} aria-label="Olvidar esta firma">
                <Trash size={18} aria-hidden />
              </button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  )
}

function TypePanel({
  name,
  onName,
  font,
  onFont,
  color,
  onColor,
}: {
  name: string
  onName: (v: string) => void
  font: ScriptFontId
  onFont: (f: ScriptFontId) => void
  color: InkColor
  onColor: (c: InkColor) => void
}) {
  const inputId = useId()
  const preview = name.trim() || 'Tu nombre'
  return (
    <div className="type">
      <div className="type__field">
        <label htmlFor={inputId} className="type__label">
          Tu nombre
        </label>
        <input id={inputId} className="text-input" value={name} onChange={(e) => onName(e.target.value)} placeholder="Nombre y apellido" autoComplete="name" maxLength={60} autoFocus />
      </div>
      <div className="type__styles" role="radiogroup" aria-label="Estilo de letra">
        {SCRIPT_FONTS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={font === f.id}
            className="type__style"
            data-active={font === f.id}
            onClick={() => onFont(f.id)}
          >
            <span className="type__sample" style={{ fontFamily: `"${f.family}", cursive`, color: INK_COLORS[color], fontSize: `${30 * f.scale}px` }} data-empty={!name.trim()}>
              {preview}
            </span>
            <span className="type__style-name">{f.label}</span>
          </button>
        ))}
      </div>
      <InkPicker color={color} onChange={onColor} />
    </div>
  )
}

function PhonePanel({ docName, color, onColor, ink, onInk }: { docName: string; color: InkColor; onColor: (c: InkColor) => void; ink: Ink | null; onInk: (ink: Ink | null) => void }) {
  const { state, restart } = usePhoneSession(!ink, docName)

  useEffect(() => {
    if (state.phase === 'received') onInk(state.ink)
  }, [state, onInk])

  if (ink) {
    const preview = inkToSignature(ink, INK_COLORS[color], 'phone')
    return (
      <div className="phone-done">
        <div className="phone-done__paper">{preview ? <SignatureArt signature={preview} className="phone-done__art" /> : null}</div>
        <p className="phone-done__note" role="status">
          Firma recibida desde el celular.
        </p>
        <div className="sign__row">
          <InkPicker color={color} onChange={onColor} />
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              onInk(null)
              restart()
            }}
          >
            <ArrowClockwise size={18} aria-hidden />
            Firmar de nuevo
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="phone">
      <div className="phone__code" data-phase={state.phase}>
        {'url' in state ? <QrCode value={state.url} label="Código QR para firmar desde el celular" /> : <div className="qr qr--empty" aria-hidden />}
      </div>
      <div className="phone__side">
        <div className="phone__heading">Firma con el dedo en tu celular</div>
        <ol className="phone__steps">
          <li>Apunta la cámara de tu celular a este código.</li>
          <li>Firma en la pantalla y toca Enviar firma.</li>
        </ol>
        <PhoneStatus state={state} onRestart={restart} />
        {'url' in state ? <ShareLink url={state.url} expiresAt={state.expiresAt} /> : null}
      </div>
    </div>
  )
}

function PhoneStatus({ state, onRestart }: { state: PhoneState; onRestart: () => void }) {
  if (state.phase === 'creating') {
    return (
      <p className="phone__status" role="status">
        <span className="spinner" aria-hidden />
        Preparando el código
      </p>
    )
  }
  if (state.phase === 'waiting') {
    return (
      <p className="phone__status" role="status">
        <span className="spinner" aria-hidden />
        Esperando que abras el enlace
      </p>
    )
  }
  if (state.phase === 'opened') {
    return (
      <p className="phone__status phone__status--live" role="status">
        <DeviceMobile size={18} weight="fill" aria-hidden />
        Celular conectado. Firma en la pantalla del teléfono.
      </p>
    )
  }
  if (state.phase === 'expired') {
    return (
      <div className="phone__problem" role="alert">
        <p>El código venció.</p>
        <button type="button" className="btn btn-outline" onClick={onRestart}>
          Crear otro código
        </button>
      </div>
    )
  }
  if (state.phase === 'error') {
    const text =
      state.reason === 'crypto'
        ? 'Este navegador no puede cifrar la firma en esta dirección. Abre eSign desde su dirección https.'
        : state.reason === 'network'
          ? 'No hay conexión con el servidor. Revisa tu internet.'
          : 'No pudimos recibir la firma.'
    return (
      <div className="phone__problem" role="alert">
        <p>{text}</p>
        {state.reason !== 'crypto' ? (
          <button type="button" className="btn btn-outline" onClick={onRestart}>
            Reintentar
          </button>
        ) : null}
      </div>
    )
  }
  return null
}

function ShareLink({ url, expiresAt }: { url: string; expiresAt: number }) {
  const [copied, setCopied] = useState(false)
  const left = useCountdown(expiresAt)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2400)
    } catch {
      window.prompt('Copia este enlace', url)
    }
  }
  return (
    <div className="phone__share">
      <button type="button" className="btn btn-outline" onClick={copy}>
        <Copy size={18} aria-hidden />
        {copied ? 'Enlace copiado' : 'Copiar enlace'}
      </button>
      <span className="phone__expires">Vence en {left}</span>
      <p className="phone__other">¿Firma otra persona? Envíale el enlace.</p>
    </div>
  )
}

function useCountdown(deadline: number) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const seconds = Math.max(0, Math.round((deadline - now) / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
