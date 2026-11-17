import { DownloadSimple, Minus, Moon, Plus, Sun } from '@phosphor-icons/react'
import { useTheme } from '../lib/theme'
import { isDirty, useDoc, useDocStore, type DocStore } from './doc'
import { Logo } from '../ui/Logo'

const STEPS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]
export const MAX_ZOOM = STEPS[STEPS.length - 1]

// A wide page (landscape, tabloid) fits the screen below 50%; zooming out
// always reaches that fit, or the page could never be seen whole again.
export const minZoom = (fitZoom: number) => Math.min(STEPS[0], fitZoom)

export function zoomStep(store: DocStore, direction: 1 | -1) {
  const { zoom, fitZoom } = store.get()
  const steps = fitZoom < STEPS[0] ? [fitZoom, ...STEPS] : STEPS
  const next = direction > 0 ? steps.find((s) => s > zoom + 0.001) : [...steps].reverse().find((s) => s < zoom - 0.001)
  if (next) store.set({ zoom: next })
}

export function ThemeToggle() {
  const [theme, toggle] = useTheme()
  const dark = theme === 'dark'
  return (
    <button type="button" className="icon-btn" onClick={toggle} aria-label={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'} title={dark ? 'Modo claro' : 'Modo oscuro'}>
      {dark ? <Sun size={20} aria-hidden /> : <Moon size={20} aria-hidden />}
    </button>
  )
}

export function TopBar({ onClose, onDownload, busy }: { onClose: () => void; onDownload: () => void; busy: boolean }) {
  const store = useDocStore()
  const { name, pages } = store.get()
  const zoom = useDoc((s) => s.zoom)
  const fitZoom = useDoc((s) => s.fitZoom)
  const dirty = useDoc(isDirty)

  return (
    <header className="topbar">
      <button type="button" className="topbar__home" onClick={onClose} aria-label="Ir al inicio" title="Ir al inicio">
        <Logo label={null} className="topbar__logo" />
        <Logo label={null} variant="mark" className="topbar__logo-mark" />
      </button>
      <span className="topbar__divider" aria-hidden />
      <div className="topbar__doc">
        <span className="topbar__name" title={name}>
          {name}
        </span>
        <span className="topbar__meta">{pages.length === 1 ? '1 página' : `${pages.length} páginas`}</span>
      </div>

      <div className="topbar__end">
        <div className="topbar__zoom" role="group" aria-label="Zoom">
          <button type="button" className="icon-btn" onClick={() => zoomStep(store, -1)} disabled={zoom <= minZoom(fitZoom) + 0.001} aria-label="Alejar" title="Alejar">
            <Minus size={18} weight="bold" aria-hidden />
          </button>
          <button
            type="button"
            className="topbar__pct"
            onClick={() => store.set((s) => ({ zoom: s.fitZoom }))}
            aria-label={`Zoom ${Math.round(zoom * 100)} por ciento. Ajustar al ancho`}
            title="Ajustar al ancho"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" className="icon-btn" onClick={() => zoomStep(store, 1)} disabled={zoom >= MAX_ZOOM - 0.001} aria-label="Acercar" title="Acercar">
            <Plus size={18} weight="bold" aria-hidden />
          </button>
        </div>
        <span className="topbar__theme">
          <ThemeToggle />
        </span>
        <button type="button" className={`btn ${dirty ? 'btn-primary' : 'btn-outline'} topbar__download`} onClick={onDownload} disabled={busy}>
          {busy ? <span className="spinner" aria-hidden /> : <DownloadSimple size={18} weight="bold" aria-hidden />}
          <span className="topbar__download-long">Descargar PDF</span>
          <span className="topbar__download-short">Descargar</span>
        </button>
      </div>
    </header>
  )
}
