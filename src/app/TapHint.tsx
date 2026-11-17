import { HandPointing } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useDoc, useDocStore, type Tool } from './doc'
import { GhostShape } from './PageView'

const CYCLE_MS = 2600
const LOOPS = 2

// On a touch screen a finger taps the middle of the document and what the
// tool places shows up under it. It leaves once the person touches the document.
export function TapHint({ tool }: { tool: Tool }) {
  const store = useDocStore()
  const zoom = useDoc((s) => s.zoom)
  const [phase, setPhase] = useState<'on' | 'leaving' | 'gone'>('on')

  useEffect(() => {
    const leave = () => setPhase((p) => (p === 'on' ? 'leaving' : p))
    const viewport = document.querySelector('.viewport')
    viewport?.addEventListener('pointerdown', leave)
    const timer = window.setTimeout(leave, CYCLE_MS * LOOPS)
    return () => {
      viewport?.removeEventListener('pointerdown', leave)
      window.clearTimeout(timer)
    }
  }, [])

  if (phase === 'gone') return null
  const { pages, currentPage } = store.get()
  return (
    <div className="tap-hint" data-leaving={phase === 'leaving' || undefined} aria-hidden onTransitionEnd={() => phase === 'leaving' && setPhase('gone')}>
      <div className="tap-hint__spot">
        <div className="tap-hint__ghost">
          <GhostShape tool={tool} zoom={zoom} pageWidth={pages[currentPage].width} />
        </div>
        <span className="tap-hint__ripple" />
        <HandPointing className="tap-hint__hand" weight="fill" />
      </div>
    </div>
  )
}
