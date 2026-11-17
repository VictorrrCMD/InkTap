import { useCallback, useEffect, useId, useState, useSyncExternalStore } from 'react'
import { exportPdf } from '../pdf/export'
import type { Field, Item, Signature } from '../pdf/model'
import { SignDialog } from '../sign/SignDialog'
import { Dialog } from '../ui/Dialog'
import { toast, Toasts } from '../ui/toast'
import { useStore } from '../lib/store'
import { DocContext, fillableFields, isDirty, isFieldDone, redo, undo, type DocStore } from './doc'
import { Dock, focusField } from './Dock'
import { canShareFiles, outputName, saveFile, shareFile } from './download'
import { FieldSheet, type SheetTarget } from './FieldSheet'
import { fitFontSize } from './fieldText'
import { docBaseline } from './metrics'
import { LINE_HEIGHT, placeInField, placeTool } from './place'
import { copySelection, cutSelection, deleteSelection, duplicateSelection, paste, selectAll } from './selection'
import { TapHint } from './TapHint'
import { TopBar } from './TopBar'
import { Viewport } from './Viewport'

function useMedia(query: string) {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', notify)
      return () => list.removeEventListener('change', notify)
    },
    () => window.matchMedia(query).matches,
  )
}

const editableTarget = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

export function Editor({ store, onClose }: { store: DocStore; onClose: () => void }) {
  const touch = useMedia('(pointer: coarse)')
  const sheetMode = useMedia('(pointer: coarse) and (max-width: 820px)')
  const signDialog = useStore(store, (s) => s.signDialog)
  const tool = useStore(store, (s) => s.tool)
  const session = useStore(store, (s) => s.lastSignature)
  const [sheet, setSheet] = useState<SheetTarget | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const confirmId = useId()

  const openSign = useCallback(
    (field?: Field) => store.set({ signDialog: { open: true, fieldId: field?.id }, tool: null, selected: [], editing: null }),
    [store],
  )

  const pickSignature = (signature: Signature) => {
    const { signDialog: dialog, fields } = store.get()
    store.set({ signDialog: { open: false }, lastSignature: signature })
    const field = dialog.fieldId ? fields.find((f) => f.id === dialog.fieldId) : undefined
    if (field) {
      placeInField(store, signature, field)
      toast('Firma colocada', { tone: 'success' })
    } else {
      store.set({ tool: { kind: 'signature', signature } })
    }
  }

  // Fields open the phone sheet; on a computer they just take focus.
  const goToField = useCallback(
    (field: Field) => {
      focusField(field)
      if (field.kind === 'signature') return
      if (sheetMode && field.kind === 'text' && !field.readOnly) setSheet({ kind: 'field', field })
    },
    [sheetMode],
  )

  const nextFieldAfter = (field: Field) => {
    const state = store.get()
    const list = fillableFields(state.fields)
    const start = list.findIndex((f) => f.name === field.name)
    for (let step = 1; step < list.length; step++) {
      const candidate = list[(start + step) % list.length]
      if (!isFieldDone(state, candidate)) return candidate
    }
    return null
  }

  const onSheetField = useCallback((field: Field) => setSheet({ kind: 'field', field }), [])
  const onEditText = useCallback((item: Item) => setSheet({ kind: 'item', itemId: item.id }), [])

  // A new empty text item on a phone goes straight to the sheet.
  useEffect(() => {
    if (!sheetMode) return
    return store.subscribe(() => {
      const { editing } = store.get()
      if (editing) {
        store.set({ editing: null })
        setSheet({ kind: 'item', itemId: editing })
      }
    })
  }, [sheetMode, store])

  useEffect(() => {
    // A focused item handles its own keys first; these work wherever focus is,
    // except inside a text box, where the browser's own copy, paste and undo apply.
    const onKey = (e: KeyboardEvent) => {
      const state = store.get()
      if (state.signDialog.open || confirmClose || e.defaultPrevented) return
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      const typing = editableTarget(e.target)
      const picked = state.selected.length > 0
      const run = (action: () => void) => {
        e.preventDefault()
        action()
      }
      if (mod && !typing && key === 'z') run(() => (e.shiftKey ? redo(store) : undo(store)))
      else if (mod && !typing && key === 'y') run(() => redo(store))
      else if (mod && !typing && key === 'c' && picked) run(() => copySelection(store))
      else if (mod && !typing && key === 'x' && picked) run(() => cutSelection(store))
      else if (mod && !typing && key === 'v' && state.clipboard.length) run(() => paste(store))
      else if (mod && !typing && key === 'd' && picked) run(() => duplicateSelection(store))
      else if (mod && !typing && key === 'a' && state.items.length) run(() => selectAll(store))
      else if (!mod && !typing && picked && (e.key === 'Delete' || e.key === 'Backspace')) run(() => deleteSelection(store))
      else if (e.key === 'Escape' && picked && !state.tool) run(() => store.set({ selected: [], editing: null }))
      else if (e.key === 'Escape' && state.tool) {
        e.preventDefault()
        store.set({ tool: null })
      } else if (e.key === 'Enter' && state.tool && !editableTarget(e.target)) {
        e.preventDefault()
        const page = state.pages[state.currentPage]
        placeTool(store, state.tool, state.currentPage, page.width / 2, page.height / 2)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [store, confirmClose])

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty(store.get())) e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [store])

  const download = async () => {
    if (busy) return
    setBusy(true)
    try {
      const s = store.get()
      const fontSizes: Record<string, number> = {}
      for (const field of s.fields) {
        if (field.kind !== 'text' && field.kind !== 'select') continue
        const value = s.values[field.name] ?? ''
        const shown = field.kind === 'select' ? (field.options?.find((o) => o.value === value)?.label ?? value) : value
        fontSizes[field.name] = fitFontSize(field, shown)
      }
      const result = await exportPdf({
        bytes: s.bytes,
        password: s.password,
        pages: s.pages,
        fields: s.fields,
        initial: s.initial,
        values: s.values,
        fontSizes,
        items: s.items,
        baseline: docBaseline(),
        lineHeight: LINE_HEIGHT,
        flatten: true,
      })
      const name = outputName(s.name, s.items.some((i) => i.type === 'signature'))
      saveFile(result.bytes, name)
      if (result.skipped.length) {
        toast(`Descargado, pero ${result.skipped.length === 1 ? 'un campo no se pudo' : `${result.skipped.length} campos no se pudieron`} escribir en el PDF.`, { tone: 'error' })
      } else {
        toast(`Descargado: ${name}`, {
          tone: 'success',
          action: touch && canShareFiles() ? { label: 'Compartir', run: () => void shareFile(result.bytes, name) } : undefined,
        })
      }
    } catch (error) {
      console.error(error)
      toast('No pudimos generar el PDF. Vuelve a intentarlo; si sigue fallando, el archivo puede estar dañado.', { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const requestClose = () => {
    if (isDirty(store.get())) setConfirmClose(true)
    else onClose()
  }

  return (
    <DocContext.Provider value={store}>
      <div className="editor" data-sheet={sheet ? 'open' : undefined}>
        <TopBar onClose={requestClose} onDownload={download} busy={busy} />
        <Viewport sheet={sheetMode} onSheet={onSheetField} onSign={openSign} onEditText={onEditText} />
        {!sheet ? <Dock touch={touch} onSignature={() => openSign()} onField={goToField} /> : null}
        {touch && tool && !sheet ? <TapHint tool={tool} /> : null}
        {sheet ? (
          <FieldSheet
            key={sheet.kind === 'field' ? sheet.field.id : sheet.itemId}
            target={sheet}
            onDone={() => setSheet(null)}
            onNext={
              sheet.kind === 'field'
                ? () => {
                    const next = nextFieldAfter(sheet.field)
                    setSheet(null)
                    if (next) requestAnimationFrame(() => goToField(next))
                  }
                : undefined
            }
          />
        ) : null}
        <p id="item-help" hidden>
          Arrastra para moverlo. Mayús o Ctrl con clic suma más elementos a la selección. Con el teclado: flechas para mover, R para girar 90 grados (Mayús+R al otro lado), corchetes para girar de 5 en 5, Supr para eliminar, Enter para editar el texto, Ctrl+C y Ctrl+V para copiar y pegar, Ctrl+Z para deshacer.
        </p>
        <SignDialog
          open={signDialog.open}
          docName={store.get().name}
          session={session}
          onClose={() => store.set({ signDialog: { open: false } })}
          onPick={pickSignature}
        />
        <Dialog open={confirmClose} onClose={() => setConfirmClose(false)} labelledBy={confirmId} className="confirm">
          <div className="confirm__body">
            <div id={confirmId} className="confirm__title">
              ¿Cerrar sin descargar?
            </div>
            <p className="confirm__text">InkTap no guarda copias de tus documentos. Si cierras ahora, se pierde lo que llenaste y firmaste.</p>
            <div className="confirm__actions">
              <button type="button" className="btn btn-quiet" onClick={() => setConfirmClose(false)} autoFocus>
                Seguir editando
              </button>
              <button type="button" className="btn btn-danger" onClick={onClose}>
                Cerrar sin descargar
              </button>
            </div>
          </div>
        </Dialog>
        <Toasts />
      </div>
    </DocContext.Provider>
  )
}
