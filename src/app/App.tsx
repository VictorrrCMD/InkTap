import { IconContext } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { NotAPdf, openPdf, PasswordNeeded } from '../pdf/open'
import { toast, Toasts } from '../ui/toast'
import { createDocStore, type DocStore } from './doc'
import { Editor } from './Editor'
import { Home } from './Home'

const MAX_BYTES = 100 * 1024 * 1024

type Phase =
  | { kind: 'home'; error?: string }
  | { kind: 'loading'; name: string }
  | { kind: 'password'; name: string; bytes: Uint8Array; incorrect: boolean }
  | { kind: 'ready'; store: DocStore }

export default function App() {
  const [phase, setPhase] = useState<Phase>({ kind: 'home' })

  const open = async (name: string, bytes: Uint8Array, password?: string) => {
    setPhase({ kind: 'loading', name })
    try {
      const opened = await openPdf(bytes, password)
      const store = createDocStore(opened, name, bytes, password)
      setPhase({ kind: 'ready', store })
      if (opened.isXfa) {
        toast('Este PDF trae un formulario dinámico que los navegadores no muestran completo. Puedes escribir encima con Texto y firmarlo.', { tone: 'error' })
      }
    } catch (error) {
      if (error instanceof PasswordNeeded) {
        setPhase({ kind: 'password', name, bytes, incorrect: error.incorrect })
      } else if (error instanceof NotAPdf) {
        setPhase({ kind: 'home', error: 'Ese archivo no es un PDF válido. Elige un archivo que termine en .pdf.' })
      } else {
        console.error(error)
        setPhase({ kind: 'home', error: 'No pudimos abrir ese PDF. Puede estar dañado; prueba con otro archivo.' })
      }
    }
  }

  const pickFile = async (file: File) => {
    if (file.size > MAX_BYTES) {
      setPhase({ kind: 'home', error: 'Ese PDF pesa más de 100 MB. Prueba con uno más ligero.' })
      return
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      await open(file.name, bytes)
    } catch {
      setPhase({ kind: 'home', error: 'No pudimos leer ese archivo. Vuelve a elegirlo.' })
    }
  }

  // Release the pdf.js worker's copy of the document when it closes.
  useEffect(() => {
    if (phase.kind !== 'ready') return
    const { close } = phase.store.get()
    return () => void close()
  }, [phase])

  return (
    <IconContext.Provider value={{ size: 20, weight: 'regular' }}>
      {phase.kind === 'ready' ? (
        <Editor store={phase.store} onClose={() => setPhase({ kind: 'home' })} />
      ) : (
        <>
          <Home
            error={phase.kind === 'home' ? phase.error : undefined}
            loading={phase.kind === 'loading' ? phase.name : undefined}
            password={phase.kind === 'password' ? { name: phase.name, incorrect: phase.incorrect } : undefined}
            onFile={pickFile}
            onPassword={(value) => phase.kind === 'password' && open(phase.name, phase.bytes, value)}
            onCancelPassword={() => setPhase({ kind: 'home' })}
          />
          <Toasts />
        </>
      )}
    </IconContext.Provider>
  )
}
