import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

interface Option<T extends string> {
  value: T
  label: ReactNode
  icon?: ReactNode
}

interface Props<T extends string> {
  label: string
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
  // "tabs" drives a tabpanel; "radio" is a plain choice (ink color, style).
  role?: 'tabs' | 'radio'
  panelId?: (value: T) => string
  className?: string
  size?: 'md' | 'sm'
}

// One control for "pick one of a few": the highlight slides to the choice
// instead of switching on in place, and arrow keys move it.
export function Segmented<T extends string>({ label, value, options, onChange, role = 'radio', panelId, className = '', size = 'md' }: Props<T>) {
  const id = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null)

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const measure = () => {
      const active = list.querySelector<HTMLElement>('[data-active="true"]')
      if (active) setThumb({ x: active.offsetLeft, w: active.offsetWidth })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    return () => observer.disconnect()
  }, [value, options.length])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = options.findIndex((o) => o.value === value)
    let next = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % options.length
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + options.length) % options.length
    if (e.key === 'Home') next = 0
    if (e.key === 'End') next = options.length - 1
    if (next < 0) return
    e.preventDefault()
    onChange(options[next].value)
    listRef.current?.querySelectorAll<HTMLElement>('.segmented__option')[next]?.focus()
  }

  const isTabs = role === 'tabs'
  return (
    <div
      ref={listRef}
      role={isTabs ? 'tablist' : 'radiogroup'}
      aria-label={label}
      className={`segmented segmented--${size} ${className}`}
      onKeyDown={onKeyDown}
    >
      {thumb ? <span className="segmented__thumb" style={{ transform: `translateX(${thumb.x}px)`, width: thumb.w }} aria-hidden /> : null}
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            id={`${id}-${option.value}`}
            type="button"
            role={isTabs ? 'tab' : 'radio'}
            aria-selected={isTabs ? active : undefined}
            aria-checked={isTabs ? undefined : active}
            aria-controls={isTabs && panelId ? panelId(option.value) : undefined}
            tabIndex={active ? 0 : -1}
            data-active={active}
            className="segmented__option"
            onClick={() => onChange(option.value)}
          >
            {option.icon}
            <span>{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
