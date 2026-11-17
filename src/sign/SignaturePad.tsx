import { useEffect, useImperativeHandle, useRef, useState, type PointerEvent as ReactPointerEvent, type Ref } from 'react'
import { INK_W, outlineToPath, strokeOutline, type Ink, type InkStroke } from './ink'

export interface PadHandle {
  clear(): void
  undo(): void
  ink(): Ink
}

interface Props {
  ref?: Ref<PadHandle>
  color: string
  label: string
  hint?: string
  onChange?: (strokes: number) => void
  className?: string
}

const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100

// Points live in a box 1000 units wide with one scale on both axes, so turning
// the phone mid-signature keeps every stroke where it was drawn.
export function SignaturePad({ ref, color, label, hint, onChange, className = '' }: Props) {
  const surface = useRef<HTMLDivElement>(null)
  const live = useRef<SVGPathElement>(null)
  const strokes = useRef<InkStroke[]>([])
  const current = useRef<{ pointer: number; stroke: InkStroke } | null>(null)
  const frame = useRef(0)
  const [paths, setPaths] = useState<string[]>([])
  const [height, setHeight] = useState(380)

  useEffect(() => {
    const el = surface.current
    if (!el) return
    const measure = () => {
      const { width, height: h } = el.getBoundingClientRect()
      if (width > 0) setHeight(r1((h / width) * INK_W))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  useImperativeHandle(
    ref,
    () => ({
      clear() {
        strokes.current = []
        current.current = null
        live.current?.setAttribute('d', '')
        setPaths([])
        onChange?.(0)
      },
      undo() {
        strokes.current = strokes.current.slice(0, -1)
        setPaths((p) => p.slice(0, -1))
        onChange?.(strokes.current.length)
      },
      ink() {
        return { width: INK_W, height, strokes: strokes.current.map((s) => ({ ...s, points: [...s.points] })) }
      },
    }),
    [height, onChange],
  )

  const toPoint = (e: PointerEvent | ReactPointerEvent): number[] => {
    const rect = surface.current!.getBoundingClientRect()
    const scale = INK_W / rect.width
    const pressure = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5
    return [r1((e.clientX - rect.left) * scale), r1((e.clientY - rect.top) * scale), r2(pressure)]
  }

  const draw = () => {
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const stroke = current.current?.stroke
      live.current?.setAttribute('d', stroke ? outlineToPath(strokeOutline(stroke, false)) : '')
    })
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (current.current) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    current.current = { pointer: e.pointerId, stroke: { points: toPoint(e), pen: e.pointerType === 'pen' } }
    draw()
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const active = current.current
    if (!active || active.pointer !== e.pointerId) return
    const events = e.nativeEvent.getCoalescedEvents?.() ?? []
    for (const ev of events.length ? events : [e.nativeEvent]) active.stroke.points.push(...toPoint(ev))
    draw()
  }

  const finish = (e: ReactPointerEvent<HTMLDivElement>) => {
    const active = current.current
    if (!active || active.pointer !== e.pointerId) return
    current.current = null
    cancelAnimationFrame(frame.current)
    frame.current = 0
    live.current?.setAttribute('d', '')
    strokes.current = [...strokes.current, active.stroke]
    setPaths((p) => [...p, outlineToPath(strokeOutline(active.stroke, true))])
    onChange?.(strokes.current.length)
  }

  return (
    <div
      ref={surface}
      className={`pad ${className}`}
      role="img"
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
    >
      <div className="pad__line" aria-hidden>
        <span className="pad__cross">×</span>
        {hint && paths.length === 0 ? <span className="pad__hint">{hint}</span> : null}
      </div>
      <svg className="pad__ink" viewBox={`0 0 ${INK_W} ${height}`} preserveAspectRatio="xMinYMin meet" aria-hidden>
        <g fill={color}>
          {paths.map((d, i) => (
            <path key={i} d={d} />
          ))}
          <path ref={live} />
        </g>
      </svg>
    </div>
  )
}
