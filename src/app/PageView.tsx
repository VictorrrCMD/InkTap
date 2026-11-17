import { memo, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { MARK_PATHS } from '../pdf/marks'
import type { Field, Item } from '../pdf/model'
import { AnnotationMode, type RenderTask } from '../pdf/pdfjs'
import { SignatureArt } from '../sign/SignatureArt'
import { useDoc, useDocStore, type Tool } from './doc'
import { FieldControl } from './FieldControl'
import { ItemView } from './ItemView'
import { MARK_SIZE, placeTool, signatureSize, TEXT_SIZE, todayText } from './place'

// iOS Safari refuses canvases above about 16.7 million pixels.
const MAX_PIXELS = 16_000_000

interface Props {
  index: number
  sheet: boolean
  onSheet: (field: Field) => void
  onSign: (field: Field) => void
  onEditText: (item: Item) => void
}

export const PageView = memo(function PageView({ index, sheet, onSheet, onSign, onEditText }: Props) {
  const store = useDocStore()
  const page = store.get().pages[index]
  const zoom = useDoc((s) => s.zoom)
  const tool = useDoc((s) => s.tool)
  const items = useDoc((s) => s.items)
  const pageItems = useMemo(() => items.filter((i) => i.page === index), [items, index])
  const fields = useMemo(() => store.get().fields.filter((f) => f.page === index), [store, index])

  const root = useRef<HTMLDivElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const ghost = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(index < 2)
  const [painted, setPainted] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const el = root.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { rootMargin: '120% 0px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Paint into a fresh canvas and swap it in when done, so a zoom change keeps
  // the old picture (stretched for a moment) instead of flashing white.
  useEffect(() => {
    if (!near) return
    let cancelled = false
    let task: RenderTask | null = null
    const timer = window.setTimeout(
      async () => {
        try {
          const pdfPage = await store.get().pdf.getPage(index + 1)
          if (cancelled) return
          const dpr = Math.min(window.devicePixelRatio || 1, 3)
          let scale = zoom * dpr
          if (page.width * page.height * scale * scale > MAX_PIXELS) scale = Math.sqrt(MAX_PIXELS / (page.width * page.height))
          const viewport = pdfPage.getViewport({ scale })
          const canvas = document.createElement('canvas')
          canvas.width = Math.floor(viewport.width)
          canvas.height = Math.floor(viewport.height)
          canvas.className = 'page__canvas'
          canvas.setAttribute('aria-hidden', 'true')
          task = pdfPage.render({ canvas, viewport, annotationMode: AnnotationMode.ENABLE_FORMS })
          await task.promise
          if (cancelled) return
          host.current?.replaceChildren(canvas)
          setPainted(true)
          setFailed(false)
        } catch (error) {
          if ((error as { name?: string })?.name === 'RenderingCancelledException' || cancelled) return
          console.error('Page render failed', error)
          setFailed(true)
        }
      },
      painted ? 140 : 0,
    )
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      task?.cancel()
    }
    // `painted` only picks the debounce, so it stays out of the dependencies:
    // finishing a paint must not start another one.
  }, [near, zoom, index, page, store])

  const localPoint = (e: { clientX: number; clientY: number }) => {
    const rect = root.current!.getBoundingClientRect()
    return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom }
  }

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const armed = store.get().tool
    if (!armed) {
      if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('page__layer')) {
        store.set({ selected: null, editing: null })
      }
      return
    }
    const { x, y } = localPoint(e)
    placeTool(store, armed, index, x, y)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = ghost.current
    if (!el || e.pointerType !== 'mouse') return
    const rect = root.current!.getBoundingClientRect()
    el.style.transform = `translate(${e.clientX - rect.left}px, ${e.clientY - rect.top}px)`
    el.dataset.visible = 'true'
  }

  return (
    <section
      ref={root}
      className="page"
      data-page={index}
      data-armed={tool ? tool.kind : undefined}
      style={{ width: page.width * zoom, height: page.height * zoom }}
      aria-label={`Página ${index + 1}`}
      onClick={onClick}
      onPointerMove={tool ? onPointerMove : undefined}
      onPointerLeave={() => ghost.current && (ghost.current.dataset.visible = 'false')}
    >
      <div ref={host} className="page__paint" />
      {!painted ? <div className="page__placeholder" aria-hidden /> : null}
      {failed ? <p className="page__error">No se pudo dibujar esta página.</p> : null}

      <div className="page__layer page__fields">
        {fields.map((field) => (
          <FieldControl key={field.id} field={field} zoom={zoom} sheet={sheet} onSheet={onSheet} onSign={onSign} />
        ))}
      </div>

      <div className="page__layer page__items">
        {pageItems.map((item) => (
          <ItemView key={item.id} item={item} zoom={zoom} page={page} sheet={sheet} onEditText={onEditText} />
        ))}
      </div>

      {tool ? (
        <div ref={ghost} className="ghost" data-visible="false" aria-hidden>
          <GhostShape tool={tool} zoom={zoom} pageWidth={page.width} />
        </div>
      ) : null}
    </section>
  )
})

function GhostShape({ tool, zoom, pageWidth }: { tool: Tool; zoom: number; pageWidth: number }) {
  if (tool.kind === 'signature') {
    const { w, h } = signatureSize(tool.signature, pageWidth)
    return (
      <div className="ghost__box ghost__box--center" style={{ width: w * zoom, height: h * zoom }}>
        <SignatureArt signature={tool.signature} />
      </div>
    )
  }
  if (tool.kind === 'mark') {
    const s = MARK_SIZE * zoom
    return (
      <svg className="ghost__box ghost__box--center" viewBox="0 0 256 256" width={s} height={s}>
        <path d={MARK_PATHS.check} fill="#16181d" />
      </svg>
    )
  }
  return (
    <div className="ghost__box ghost__box--text doc-font" style={{ fontSize: TEXT_SIZE * zoom }}>
      {tool.kind === 'date' ? todayText() : 'Texto'}
    </div>
  )
}
