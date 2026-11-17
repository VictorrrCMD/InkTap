import { useEffect, useLayoutEffect, useRef } from 'react'
import type { Field, Item } from '../pdf/model'
import { useDoc, useDocStore } from './doc'
import { PageView } from './PageView'

interface Props {
  sheet: boolean
  onSheet: (field: Field) => void
  onSign: (field: Field) => void
  onEditText: (item: Item) => void
}

export function Viewport({ sheet, onSheet, onSign, onEditText }: Props) {
  const store = useDocStore()
  const pages = store.get().pages
  const zoom = useDoc((s) => s.zoom)
  const ref = useRef<HTMLElement>(null)
  const anchor = useRef({ zoom, x: 0.5, y: 0 })

  // Fit the widest page to the width; keep fitting on resize until the person
  // picks a zoom of their own.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const widest = Math.max(...pages.map((p) => p.width))
    const compute = () => {
      const gutter = el.clientWidth < 640 ? 10 : 40
      const fit = Math.max(0.3, Math.min(1.4, (el.clientWidth - gutter * 2) / widest))
      const s = store.get()
      const following = Math.abs(s.zoom - s.fitZoom) < 0.001
      store.set({ fitZoom: fit, ...(following ? { zoom: fit } : null) })
    }
    compute()
    const observer = new ResizeObserver(compute)
    observer.observe(el)
    return () => observer.disconnect()
  }, [pages, store])

  // Zooming keeps the point at the middle of the screen in place.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || anchor.current.zoom === zoom) return
    el.scrollTop = anchor.current.y * el.scrollHeight - el.clientHeight / 2
    el.scrollLeft = anchor.current.x * el.scrollWidth - el.clientWidth / 2
    anchor.current = { ...anchor.current, zoom }
  }, [zoom])

  const remember = () => {
    const el = ref.current
    if (!el) return
    anchor.current = {
      zoom: store.get().zoom,
      x: (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth,
      y: (el.scrollTop + el.clientHeight / 2) / el.scrollHeight,
    }
  }

  useEffect(remember, [store])

  // The page most in view is "current": keyboard placement drops there.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ratios = new Map<number, number>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) ratios.set(Number((entry.target as HTMLElement).dataset.page), entry.intersectionRatio)
        let best = store.get().currentPage
        let max = -1
        for (const [page, ratio] of ratios) {
          if (ratio > max) {
            max = ratio
            best = page
          }
        }
        if (best !== store.get().currentPage) store.set({ currentPage: best })
      },
      { root: el, threshold: [0, 0.2, 0.4, 0.6, 0.8, 1] },
    )
    el.querySelectorAll('.page').forEach((p) => observer.observe(p))
    return () => observer.disconnect()
  }, [store])

  return (
    <main ref={ref} className="viewport" onScroll={remember} aria-label="Documento">
      <div className="pages">
        {pages.map((page) => (
          <PageView key={page.index} index={page.index} sheet={sheet} onSheet={onSheet} onSign={onSign} onEditText={onEditText} />
        ))}
      </div>
    </main>
  )
}
