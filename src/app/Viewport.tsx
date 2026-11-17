import { useEffect, useLayoutEffect, useRef, type MouseEvent } from 'react'
import type { Field, Item } from '../pdf/model'
import { useDoc, useDocStore } from './doc'
import { PageView } from './PageView'
import { clamp, gesture } from './selection'
import { MAX_ZOOM, minZoom } from './TopBar'

interface Props {
  sheet: boolean
  onSheet: (field: Field) => void
  onSign: (field: Field) => void
  onEditText: (item: Item) => void
}

// A point of the document (page and position in page points) and where on screen it should stay.
interface Anchor {
  page: number
  x: number
  y: number
  fx: number
  fy: number
}

// A zoom in progress: drawn as a transform, laid out once the fingers lift.
interface Pinch {
  z0: number
  scale: number
  // Focus at the start (content coordinates) and where it is now (viewport coordinates).
  from: { x: number; y: number }
  at0: { x: number; y: number }
  at: { x: number; y: number }
  spacer: HTMLElement
}

export function Viewport({ sheet, onSheet, onSign, onEditText }: Props) {
  const store = useDocStore()
  const pages = store.get().pages
  const zoom = useDoc((s) => s.zoom)
  const ref = useRef<HTMLElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const anchor = useRef<Anchor | null>(null)
  const settle = useRef<(() => void) | null>(null)
  const laidOut = useRef(zoom)

  // The page at a content point (or the nearest one), and the point in its own coordinates.
  const pageAt = (cx: number, cy: number, z: number) => {
    const list = pagesRef.current?.children
    if (!list?.length) return null
    let lo = 0
    let hi = list.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if ((list[mid] as HTMLElement).offsetTop <= cy) lo = mid
      else hi = mid - 1
    }
    const el = list[lo] as HTMLElement
    return { page: lo, x: (cx - el.offsetLeft) / z, y: (cy - el.offsetTop) / z }
  }

  const remember = () => {
    const el = ref.current
    if (!el) return
    const fx = el.clientWidth / 2
    const fy = el.clientHeight / 2
    const at = pageAt(el.scrollLeft + fx, el.scrollTop + fy, store.get().zoom)
    if (at) anchor.current = { ...at, fx, fy }
  }

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

  // After a zoom, the remembered point goes back under the focus: the middle
  // of the screen for the buttons, the fingers or the pointer for a pinch.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || laidOut.current === zoom) return
    laidOut.current = zoom
    settle.current?.()
    settle.current = null
    const a = anchor.current
    const target = a && (pagesRef.current?.children[a.page] as HTMLElement | undefined)
    if (!a || !target) return
    el.scrollLeft = target.offsetLeft + a.x * zoom - a.fx
    el.scrollTop = target.offsetTop + a.y * zoom - a.fy
  }, [zoom])

  useEffect(remember, [store])

  // Pinch with two fingers, a trackpad pinch (Ctrl+wheel), or Safari's gesture events.
  useEffect(() => {
    const el = ref.current
    const content = pagesRef.current
    if (!el || !content) return
    let pinch: Pinch | null = null
    let wheelEnd = 0

    const local = (x: number, y: number) => {
      const r = el.getBoundingClientRect()
      return { x: x - r.left, y: y - r.top }
    }

    const begin = (at: { x: number; y: number }) => {
      // Holds the scroll area at its size while the content shrinks under the transform.
      const spacer = document.createElement('div')
      spacer.className = 'viewport__spacer'
      spacer.style.width = `${el.scrollWidth}px`
      spacer.style.height = `${el.scrollHeight}px`
      el.append(spacer)
      content.style.transformOrigin = '0 0'
      content.style.willChange = 'transform'
      gesture.pinching = true
      pinch = { z0: store.get().zoom, scale: 1, from: { x: el.scrollLeft + at.x, y: el.scrollTop + at.y }, at0: at, at, spacer }
    }

    const update = (scale: number, at: { x: number; y: number }) => {
      if (!pinch) return
      const z = clamp(pinch.z0 * scale, minZoom(store.get().fitZoom), MAX_ZOOM)
      const s = z / pinch.z0
      pinch.scale = s
      pinch.at = at
      const tx = pinch.from.x + (at.x - pinch.at0.x) - pinch.from.x * s
      const ty = pinch.from.y + (at.y - pinch.at0.y) - pinch.from.y * s
      content.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`
    }

    const finish = () => {
      const p = pinch
      if (!p) return
      pinch = null
      gesture.pinching = false
      const clear = () => {
        content.style.transform = ''
        content.style.transformOrigin = ''
        content.style.willChange = ''
        p.spacer.remove()
      }
      const { fitZoom } = store.get()
      let z = clamp(p.z0 * p.scale, minZoom(fitZoom), MAX_ZOOM)
      // Close to the width of the screen: land exactly on it, centered with no sideways scroll.
      if (Math.abs(z - fitZoom) / fitZoom < 0.06) z = fitZoom
      if (Math.abs(z - p.z0) < 0.001) {
        clear()
        el.scrollLeft = p.from.x - p.at.x
        el.scrollTop = p.from.y - p.at.y
        return
      }
      const at = pageAt(p.from.x, p.from.y, p.z0)
      if (at) anchor.current = { ...at, fx: p.at.x, fy: p.at.y }
      settle.current = clear
      store.set({ zoom: z })
    }

    const spread = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const middle = (t: TouchList) => local((t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2)
    let startSpread = 1

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return
      if (e.cancelable) e.preventDefault()
      if (pinch) finish()
      startSpread = spread(e.touches) || 1
      begin(middle(e.touches))
    }
    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return
      if (e.cancelable) e.preventDefault()
      update(spread(e.touches) / startSpread, middle(e.touches))
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (pinch && e.touches.length < 2) finish()
    }

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const at = local(e.clientX, e.clientY)
      if (!pinch) begin(at)
      // A mouse wheel notch is a big step and a trackpad pinch many small ones; cap each so a notch is about 20%.
      const step = clamp(e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY, -25, 25)
      update(pinch!.scale * Math.exp(-step * 0.008), at)
      window.clearTimeout(wheelEnd)
      wheelEnd = window.setTimeout(finish, 160)
    }

    // Safari on a Mac pinches through gesture events; on an iPhone the touch handlers do it.
    type SafariGesture = UIEvent & { scale: number; clientX: number; clientY: number }
    const touchScreen = navigator.maxTouchPoints > 0
    const onGestureStart = (e: Event) => {
      e.preventDefault()
      if (touchScreen) return
      const g = e as SafariGesture
      begin(local(g.clientX, g.clientY))
    }
    const onGestureChange = (e: Event) => {
      e.preventDefault()
      const g = e as SafariGesture
      if (!touchScreen && pinch) update(g.scale, pinch.at)
    }
    const onGestureEnd = (e: Event) => {
      e.preventDefault()
      if (!touchScreen) finish()
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
    el.addEventListener('wheel', onWheel, { passive: false })
    // On the whole page, so a pinch on the toolbars doesn't zoom the browser either.
    document.addEventListener('gesturestart', onGestureStart)
    document.addEventListener('gesturechange', onGestureChange)
    document.addEventListener('gestureend', onGestureEnd)
    return () => {
      window.clearTimeout(wheelEnd)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
      el.removeEventListener('wheel', onWheel)
      document.removeEventListener('gesturestart', onGestureStart)
      document.removeEventListener('gesturechange', onGestureChange)
      document.removeEventListener('gestureend', onGestureEnd)
      gesture.pinching = false
    }
  }, [store])

  // The page most in view is "current": keyboard placement and paste land there.
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

  // A click anywhere in the document that misses the selection lets go of it.
  // Shift, Ctrl or Cmd keep it, as they add to it.
  const onClick = (e: MouseEvent<HTMLElement>) => {
    if (e.shiftKey || e.ctrlKey || e.metaKey) return
    if ((e.target as HTMLElement).closest('.item')) return
    const { selected, editing } = store.get()
    if (selected.length || editing) store.set({ selected: [], editing: null })
  }

  return (
    <main ref={ref} className="viewport" onScroll={remember} onClick={onClick} aria-label="Documento">
      <div ref={pagesRef} className="pages">
        {pages.map((page) => (
          <PageView key={page.index} index={page.index} sheet={sheet} onSheet={onSheet} onSign={onSign} onEditText={onEditText} />
        ))}
      </div>
    </main>
  )
}
