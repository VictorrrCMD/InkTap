import { CalendarBlank, CheckCircle, CheckSquare, Signature as SignatureIcon, TextT } from '@phosphor-icons/react'
import { useMemo } from 'react'
import type { Field } from '../pdf/model'
import { fillableFields, isFieldDone, useDoc, useDocStore, type Tool } from './doc'

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function focusField(field: Field) {
  const el = document.querySelector<HTMLElement>(`[data-field-id="${CSS.escape(field.id)}"]`)
  if (!el) return
  el.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' })
  el.focus({ preventScroll: true })
}

interface Props {
  touch: boolean
  onSignature: () => void
  onField: (field: Field) => void
}

export function Dock({ touch, onSignature, onField }: Props) {
  const store = useDocStore()
  const tool = useDoc((s) => s.tool)
  const signed = useDoc((s) => s.items.some((i) => i.type === 'signature'))

  const arm = (kind: Exclude<Tool['kind'], 'signature'>) =>
    store.set((s) => ({ tool: s.tool?.kind === kind ? null : { kind }, selected: null, editing: null }))

  return (
    <div className="dock-wrap">
      {tool ? <PlacementHint tool={tool} touch={touch} /> : null}
      <FieldNav onField={onField} />
      <div className="dock" role="toolbar" aria-label="Herramientas">
        <button
          type="button"
          className="dock__btn"
          data-primary={!signed || undefined}
          aria-pressed={tool?.kind === 'signature'}
          onClick={() => (tool?.kind === 'signature' ? store.set({ tool: null }) : onSignature())}
        >
          <SignatureIcon size={22} aria-hidden />
          <span>Firmar</span>
        </button>
        <span className="dock__sep" aria-hidden />
        <button type="button" className="dock__btn" aria-pressed={tool?.kind === 'text'} onClick={() => arm('text')}>
          <TextT size={22} aria-hidden />
          <span>Texto</span>
        </button>
        <button type="button" className="dock__btn" aria-pressed={tool?.kind === 'date'} onClick={() => arm('date')}>
          <CalendarBlank size={22} aria-hidden />
          <span>Fecha</span>
        </button>
        <button type="button" className="dock__btn" aria-pressed={tool?.kind === 'mark'} onClick={() => arm('mark')}>
          <CheckSquare size={22} aria-hidden />
          <span>Marca</span>
        </button>
      </div>
    </div>
  )
}

function PlacementHint({ tool, touch }: { tool: Tool; touch: boolean }) {
  const what = tool.kind === 'signature' ? 'la firma' : tool.kind === 'text' ? 'el texto' : tool.kind === 'date' ? 'la fecha' : 'la marca'
  return (
    <div className="hint" role="status">
      <span>{touch ? `Toca el documento donde va ${what}` : `Haz clic en el documento donde va ${what}`}</span>
      {!touch ? (
        <span className="hint__keys">
          <span className="kbd">Enter</span> al centro <span className="kbd">Esc</span> cancela
        </span>
      ) : null}
    </div>
  )
}

function FieldNav({ onField }: { onField: (field: Field) => void }) {
  const store = useDocStore()
  const fields = useMemo(() => fillableFields(store.get().fields), [store])
  const pending = useDoc((s) => fields.filter((f) => !isFieldDone(s, f)).length)
  const hasTool = useDoc((s) => s.tool !== null)
  if (!fields.length || hasTool) return null

  const next = () => {
    const state = store.get()
    const activeId = document.activeElement?.closest('[data-field-id]')?.getAttribute('data-field-id')
    const activeName = state.fields.find((f) => f.id === activeId)?.name
    const start = activeName ? fields.findIndex((f) => f.name === activeName) : -1
    for (let step = 1; step <= fields.length; step++) {
      const field = fields[(start + step + fields.length) % fields.length]
      if (!isFieldDone(state, field)) {
        onField(field)
        return
      }
    }
  }

  return (
    <div className="field-nav" data-done={pending === 0 || undefined}>
      {pending ? (
        <>
          <span className="field-nav__count" aria-live="polite">
            {pending === 1 ? '1 campo por llenar' : `${pending} campos por llenar`}
          </span>
          <button type="button" className="field-nav__next" onClick={next}>
            Siguiente campo
          </button>
        </>
      ) : (
        <span className="field-nav__count" aria-live="polite">
          <CheckCircle size={18} weight="fill" aria-hidden />
          Campos completos
        </span>
      )}
    </div>
  )
}
