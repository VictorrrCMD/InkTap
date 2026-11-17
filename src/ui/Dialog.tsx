import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  labelledBy: string
  className?: string
  children: ReactNode
}

// Native <dialog>: focus is trapped and restored by the browser, Escape
// closes it, and it sits in the top layer above the document.
export function Dialog({ open, onClose, labelledBy, className = '', children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const downOnBackdrop = useRef(false)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      className={`sheet ${className}`}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      // A stroke that ends past the dialog's edge also clicks the backdrop:
      // close only when the press began there.
      onPointerDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && downOnBackdrop.current) onClose()
        downOnBackdrop.current = false
      }}
    >
      {open ? children : null}
    </dialog>
  )
}
