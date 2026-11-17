import { Signature as SignatureIcon } from '@phosphor-icons/react'
import { memo, type CSSProperties } from 'react'
import { MARK_PATHS } from '../pdf/marks'
import type { Field } from '../pdf/model'
import { setValue, useDoc, useDocStore } from './doc'
import { fieldSize, fitFontSize } from './fieldText'

// The label a person reads for a field: its tooltip text (/TU) when the form
// has one, else the last part of its name made readable.
export function fieldLabel(field: Field): string {
  if (field.label) return field.label
  const last = field.name.split('.').pop() ?? field.name
  const words = last
    .replace(/\[\d+\]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
  return words ? words[0].toUpperCase() + words.slice(1) : 'Campo'
}

// On a rotated page the control keeps the field's own proportions and turns
// with the page, so it previews exactly what the PDF will show.
function boxStyle(field: Field, zoom: number): CSSProperties {
  const { w, h } = fieldSize(field)
  const cx = field.rect.x + field.rect.w / 2
  const cy = field.rect.y + field.rect.h / 2
  const style: CSSProperties = {
    left: (cx - w / 2) * zoom,
    top: (cy - h / 2) * zoom,
    width: w * zoom,
    height: h * zoom,
  }
  if (field.rotation % 360 !== 0) style.transform = `rotate(${field.rotation}deg)`
  if (field.background) style.backgroundColor = field.background
  if (field.border) {
    const width = Math.max(1, field.border.width * zoom)
    if (field.border.style === 'underline') style.borderBottom = `${width}px solid ${field.border.color}`
    else style.border = `${width}px ${field.border.style} ${field.border.color}`
  }
  return style
}

interface Props {
  field: Field
  zoom: number
  sheet: boolean
  onSheet: (field: Field) => void
  onSign: (field: Field) => void
}

export const FieldControl = memo(function FieldControl({ field, zoom, sheet, onSheet, onSign }: Props) {
  const store = useDocStore()
  const value = useDoc((s) => s.values[field.name] ?? '')
  const signed = useDoc((s) => field.kind === 'signature' && s.items.some((i) => i.type === 'signature' && i.fieldId === field.id))
  const label = fieldLabel(field)
  const style = boxStyle(field, zoom)
  const own = fieldSize(field)
  const common = {
    'data-field-id': field.id,
    'data-field-name': field.name,
    'aria-required': field.required || undefined,
  }

  if (field.kind === 'text' || field.kind === 'select') {
    const shown = field.kind === 'select' ? (field.options?.find((o) => o.value === value)?.label ?? value) : value
    const fontSize = fitFontSize(field, shown) * zoom
    const textStyle: CSSProperties = {
      ...style,
      fontSize,
      color: field.textColor ?? '#111',
      textAlign: field.align,
      paddingInline: Math.max(1, 2 * zoom),
    }
    if (field.readOnly) {
      return (
        <div className="pdf-field pdf-field--static doc-font" style={{ ...textStyle, lineHeight: `${own.h * zoom}px` }}>
          {value}
        </div>
      )
    }
    if (field.kind === 'select') {
      return (
        <select
          {...common}
          className="pdf-field pdf-field--select doc-font"
          style={textStyle}
          value={value}
          aria-label={label}
          onChange={(e) => setValue(store, field.name, e.target.value)}
        >
          <option value="" />
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )
    }
    if (sheet) {
      // On phones the field opens a full-size input above the keyboard, so
      // Safari never zooms into 9px text and the keyboard never covers it.
      return (
        <button
          {...common}
          type="button"
          className="pdf-field pdf-field--text pdf-field--tap doc-font"
          style={{ ...textStyle, lineHeight: field.multiline ? 1.2 : `${own.h * zoom}px`, whiteSpace: field.multiline ? 'pre-wrap' : 'pre' }}
          aria-label={value ? `${label}: ${value}` : label}
          onClick={() => onSheet(field)}
        >
          {value}
        </button>
      )
    }
    if (field.multiline) {
      return (
        <textarea
          {...common}
          className="pdf-field pdf-field--text doc-font"
          style={{ ...textStyle, paddingBlock: Math.max(1, 2 * zoom) }}
          value={value}
          maxLength={field.maxLen}
          aria-label={label}
          spellCheck={false}
          onChange={(e) => setValue(store, field.name, e.target.value)}
        />
      )
    }
    return (
      <input
        {...common}
        type="text"
        className="pdf-field pdf-field--text doc-font"
        style={textStyle}
        value={value}
        maxLength={field.maxLen}
        aria-label={label}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => setValue(store, field.name, e.target.value)}
      />
    )
  }

  if (field.kind === 'checkbox' || field.kind === 'radio') {
    const on = value !== '' && value === field.onValue
    const size = Math.min(field.rect.w, field.rect.h) * zoom
    const mark =
      field.kind === 'checkbox' ? (
        <svg viewBox="0 0 256 256" width={size * 0.78} height={size * 0.78} aria-hidden>
          <path d={MARK_PATHS.check} fill={field.textColor ?? '#111'} />
        </svg>
      ) : (
        <span className="pdf-field__dot" style={{ width: size * 0.48, height: size * 0.48, background: field.textColor ?? '#111' }} aria-hidden />
      )
    if (field.readOnly) {
      return (
        <div className="pdf-field pdf-field--static pdf-field--button" style={style}>
          {on ? mark : null}
        </div>
      )
    }
    return (
      <button
        {...common}
        type="button"
        role={field.kind}
        aria-checked={on}
        aria-label={field.kind === 'radio' ? `${label}: ${field.onValue}` : label}
        className={`pdf-field pdf-field--button pdf-field--${field.kind}`}
        style={style}
        onClick={() => {
          if (field.kind === 'radio') setValue(store, field.name, field.onValue ?? '')
          else setValue(store, field.name, on ? '' : (field.onValue ?? 'Yes'))
        }}
      >
        {on ? mark : null}
      </button>
    )
  }

  // Signature field: an invitation until a signature fills it.
  if (signed) return null
  const fontSize = Math.min(13, Math.max(8, own.h * 0.3)) * zoom
  return (
    <button {...common} type="button" className="pdf-field sig-slot" style={{ ...style, fontSize }} onClick={() => onSign(field)} aria-label={`Firmar aquí: ${label}`}>
      <SignatureIcon size={fontSize * 1.5} weight="regular" aria-hidden />
      <span>Firmar aquí</span>
    </button>
  )
})
