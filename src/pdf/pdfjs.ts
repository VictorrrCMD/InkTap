// The legacy build: pdf.js 6's modern build calls brand-new built-ins (such as
// Uint8Array#toHex) that Chrome 137 and many phones don't have yet.
import { AnnotationMode, AnnotationType, GlobalWorkerOptions, getDocument, PasswordResponses } from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerSrc from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerSrc

export type PdfDoc = Awaited<ReturnType<typeof getDocument>['promise']>
export type PdfPage = Awaited<ReturnType<PdfDoc['getPage']>>
export type Viewport = ReturnType<PdfPage['getViewport']>
export type RenderTask = ReturnType<PdfPage['render']>

export const ASSETS = {
  cMapUrl: '/pdfjs/cmaps/',
  cMapPacked: true,
  standardFontDataUrl: '/pdfjs/standard_fonts/',
  wasmUrl: '/pdfjs/wasm/',
  iccUrl: '/pdfjs/iccs/',
}

export { AnnotationMode, AnnotationType, getDocument, PasswordResponses }
