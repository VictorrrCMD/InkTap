import { FilePdf, LockSimple } from '@phosphor-icons/react'
import { lazy, Suspense, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { useTheme } from '../lib/theme'
import { ThemeToggle } from './TopBar'
import { Logo } from '../ui/Logo'

const SigningDemo = lazy(() => import('../demo/SigningDemo'))

// On a phone you sign right on the screen; the QR is for computers.
function useTouchOnly() {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia('(any-pointer: fine)')
      list.addEventListener('change', notify)
      return () => list.removeEventListener('change', notify)
    },
    () => !window.matchMedia('(any-pointer: fine)').matches,
  )
}

interface Props {
  error?: string
  loading?: string
  password?: { name: string; incorrect: boolean }
  onFile: (file: File) => void
  onPassword: (password: string) => void
  onCancelPassword: () => void
}

export function Home({ error, loading, password, onFile, onPassword, onCancelPassword }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [theme] = useTheme()
  const touchOnly = useTouchOnly()

  // The whole window takes the drop, not only the sheet.
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth++
      setDragging(true)
    }
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (!depth) setDragging(false)
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      const file = e.dataTransfer?.files[0]
      if (file) onFile(file)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [onFile])

  return (
    <div className="home" data-dragging={dragging || undefined}>
      <header className="home__bar">
        <Logo />
        <ThemeToggle />
      </header>

      <main className="home__main">
        <section className="home__intro">
          <h1 className="home__title">Rellena y firma tus PDF sin imprimirlos</h1>
          <p className="home__lead">
            {touchOnly
              ? 'Escribe en los campos y firma con el dedo, directo en la pantalla.'
              : 'Escribe en los campos y firma con el mouse, o escanea un código y firma con el dedo en tu celular.'}
          </p>

          {password ? (
            <PasswordCard name={password.name} incorrect={password.incorrect} onSubmit={onPassword} onCancel={onCancelPassword} />
          ) : (
            <div className="drop" data-busy={loading ? true : undefined}>
              <FilePdf size={32} weight="regular" className="drop__icon" aria-hidden />
              {loading ? (
                <p className="drop__text" role="status">
                  <span className="spinner" aria-hidden />
                  Abriendo {loading}
                </p>
              ) : (
                <>
                  <p className="drop__text">Arrastra tu PDF a esta hoja</p>
                  <button type="button" className="btn btn-primary btn-lg" onClick={() => input.current?.click()}>
                    Elegir PDF
                  </button>
                </>
              )}
              <div className="drop__line" aria-hidden>
                <span>×</span>
              </div>
              <input
                ref={input}
                type="file"
                accept="application/pdf,.pdf"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) onFile(file)
                }}
              />
            </div>
          )}

          {error ? (
            <p className="home__error" role="alert">
              {error}
            </p>
          ) : null}

          <p className="home__privacy">
            <LockSimple size={18} weight="fill" aria-hidden />
            Tu PDF se abre en este navegador y no se sube a ningún servidor.
          </p>
        </section>

        {/* One picture for screen readers, not the scene's inner labels read one by one. */}
        <div className="home__demo" role="img" aria-label="Animación: un dedo firma en el celular y la firma aparece en la línea del contrato en la computadora.">
          <Suspense fallback={<div className="demo-fallback" />}>
            <SigningDemo theme={theme} />
          </Suspense>
        </div>
      </main>

      {dragging ? (
        <div className="drop-overlay" aria-hidden>
          <span>Suelta el PDF para abrirlo</span>
        </div>
      ) : null}
    </div>
  )
}

function PasswordCard({ name, incorrect, onSubmit, onCancel }: { name: string; incorrect: boolean; onSubmit: (p: string) => void; onCancel: () => void }) {
  const id = useId()
  const [value, setValue] = useState('')
  return (
    <form
      className="password"
      onSubmit={(e) => {
        e.preventDefault()
        if (value) onSubmit(value)
      }}
    >
      <div className="password__title">{name} tiene contraseña</div>
      <label htmlFor={id} className="password__label">
        Contraseña del PDF
      </label>
      <input id={id} type="password" className="text-input" value={value} onChange={(e) => setValue(e.target.value)} autoFocus autoComplete="off" aria-invalid={incorrect || undefined} aria-describedby={incorrect ? `${id}-error` : undefined} />
      {incorrect ? (
        <p id={`${id}-error`} className="password__error">
          Esa contraseña no abre el archivo. Revisa mayúsculas y números.
        </p>
      ) : null}
      <div className="password__actions">
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Elegir otro archivo
        </button>
        <button type="submit" className="btn btn-primary" disabled={!value}>
          Abrir
        </button>
      </div>
    </form>
  )
}
