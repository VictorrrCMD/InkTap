// The PDFs the end-to-end checks open: every field type, flat, rotated,
// protected, password and offset CropBox. Run: node scripts/make-fixtures.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { PDFDocument, PDFString, StandardFonts, degrees, rgb } from '@cantoo/pdf-lib'

const out = new URL('../tests/fixtures/', import.meta.url)
mkdirSync(out, { recursive: true })

const ink = rgb(0.1, 0.12, 0.18)
const gray = rgb(0.45, 0.48, 0.55)

async function base(title) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  doc.setTitle(title)
  return { doc, font, bold }
}

function paragraph(page, font, text, x, y, size = 10.5, width = 470) {
  const words = text.split(' ')
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(next, size) > width) {
      page.drawText(line, { x, y, size, font, color: ink })
      y -= size * 1.45
      line = word
    } else line = next
  }
  if (line) page.drawText(line, { x, y, size, font, color: ink })
  return y - size * 1.45
}

function addSignatureField(doc, page, name, [x1, y1, x2, y2]) {
  const form = doc.getForm()
  const dict = doc.context.obj({
    FT: 'Sig',
    T: PDFString.of(name),
    Type: 'Annot',
    Subtype: 'Widget',
    Rect: [x1, y1, x2, y2],
    F: 4,
    P: page.ref,
  })
  const ref = doc.context.register(dict)
  page.node.addAnnot(ref)
  form.acroForm.addField(ref)
}

async function formPdf() {
  const { doc, font, bold } = await base('Solicitud de servicio')
  const page = doc.addPage([612, 792])
  const form = doc.getForm()
  page.drawText('Solicitud de servicio', { x: 56, y: 730, size: 20, font: bold, color: ink })
  paragraph(page, font, 'Llena tus datos tal como aparecen en tu identificación. Los campos con asterisco son obligatorios.', 56, 708, 10, 500)

  const label = (text, y, x = 56) => page.drawText(text, { x, y, size: 10, font, color: gray })
  label('Nombre completo *', 662)
  const nombre = form.createTextField('cliente.nombre')
  nombre.addToPage(page, { x: 56, y: 632, width: 320, height: 24, borderWidth: 1, borderColor: gray })
  nombre.enableRequired()

  label('Correo electrónico', 662, 392)
  const correo = form.createTextField('cliente.correo')
  correo.addToPage(page, { x: 392, y: 632, width: 164, height: 24, borderWidth: 1, borderColor: gray })

  label('Estado', 602)
  const estado = form.createDropdown('cliente.estado')
  estado.addOptions(['Jalisco', 'Ciudad de México', 'Nuevo León', 'Yucatán'])
  estado.addToPage(page, { x: 56, y: 572, width: 200, height: 24, borderWidth: 1, borderColor: gray })

  label('Plan', 602, 280)
  const plan = form.createRadioGroup('servicio.plan')
  plan.addOptionToPage('basico', page, { x: 280, y: 576, width: 16, height: 16, borderWidth: 1, borderColor: gray })
  page.drawText('Básico', { x: 302, y: 580, size: 10, font, color: ink })
  plan.addOptionToPage('completo', page, { x: 360, y: 576, width: 16, height: 16, borderWidth: 1, borderColor: gray })
  page.drawText('Completo', { x: 382, y: 580, size: 10, font, color: ink })

  label('Comentarios', 542)
  const notas = form.createTextField('servicio.notas')
  notas.enableMultiline()
  notas.addToPage(page, { x: 56, y: 452, width: 500, height: 80, borderWidth: 1, borderColor: gray })

  const acepto = form.createCheckBox('servicio.acepto')
  acepto.addToPage(page, { x: 56, y: 418, width: 14, height: 14, borderWidth: 1, borderColor: gray })
  page.drawText('Acepto los términos del servicio', { x: 78, y: 421, size: 10, font, color: ink })

  const folio = form.createTextField('interno.folio')
  folio.setText('F-20931')
  folio.addToPage(page, { x: 436, y: 728, width: 120, height: 20, borderWidth: 0 })
  folio.enableReadOnly()

  page.drawText('Firma del cliente', { x: 56, y: 300, size: 10, font, color: gray })
  page.drawLine({ start: { x: 56, y: 312 }, end: { x: 300, y: 312 }, thickness: 0.8, color: gray })
  addSignatureField(doc, page, 'firma.cliente', [56, 314, 300, 374])
  return doc.save()
}

async function flatPdf() {
  const { doc, font, bold } = await base('Contrato de arrendamiento')
  for (let n = 1; n <= 2; n++) {
    const page = doc.addPage([612, 792])
    page.drawText(n === 1 ? 'Contrato de arrendamiento' : 'Cláusulas', { x: 64, y: 724, size: 18, font: bold, color: ink })
    let y = 690
    const text =
      'Las partes acuerdan que el inmueble se entrega en buen estado y que el arrendatario lo devolverá en las mismas condiciones, salvo el desgaste natural por el uso. El pago se hará los primeros cinco días de cada mes mediante transferencia a la cuenta que indique el arrendador.'
    for (let i = 0; i < 4; i++) y = paragraph(page, font, text, 64, y) - 8
    if (n === 2) {
      page.drawText('Nombre del arrendatario:', { x: 64, y: 250, size: 10.5, font, color: ink })
      page.drawLine({ start: { x: 190, y: 248 }, end: { x: 470, y: 248 }, thickness: 0.7, color: gray })
      page.drawText('Fecha:', { x: 64, y: 216, size: 10.5, font, color: ink })
      page.drawLine({ start: { x: 104, y: 214 }, end: { x: 250, y: 214 }, thickness: 0.7, color: gray })
      page.drawLine({ start: { x: 64, y: 150 }, end: { x: 300, y: 150 }, thickness: 0.7, color: gray })
      page.drawText('Firma', { x: 64, y: 136, size: 9.5, font, color: gray })
    }
  }
  return doc.save()
}

async function rotatedPdf() {
  const { doc, font, bold } = await base('Página rotada')
  const page = doc.addPage([612, 792])
  page.setRotation(degrees(90))
  page.drawText('Página con /Rotate 90', { x: 72, y: 700, size: 18, font: bold, color: ink })
  page.drawText('Nombre:', { x: 72, y: 640, size: 11, font, color: ink })
  const form = doc.getForm()
  const f = form.createTextField('rotada.nombre')
  f.addToPage(page, { x: 130, y: 632, width: 240, height: 22, borderWidth: 1, borderColor: gray })
  page.drawLine({ start: { x: 72, y: 420 }, end: { x: 320, y: 420 }, thickness: 0.8, color: gray })
  page.drawText('Firma', { x: 72, y: 404, size: 10, font, color: gray })
  return doc.save()
}

async function protectedPdf() {
  const bytes = await formPdf()
  const doc = await PDFDocument.load(bytes)
  doc.encrypt({ userPassword: '', ownerPassword: 'propietario', permissions: { printing: 'highResolution', fillingForms: true } })
  return doc.save()
}

async function passwordPdf() {
  const { doc, font, bold } = await base('Con contraseña')
  const page = doc.addPage([612, 792])
  page.drawText('Documento con contraseña de apertura', { x: 64, y: 724, size: 16, font: bold, color: ink })
  paragraph(page, font, 'La contraseña de prueba es 1234.', 64, 690)
  doc.encrypt({ userPassword: '1234', ownerPassword: 'propietario' })
  return doc.save()
}

async function croppedPdf() {
  const { doc, font, bold } = await base('CropBox desplazado')
  const page = doc.addPage([700, 900])
  page.setCropBox(50, 60, 612, 792)
  page.drawText('Página con CropBox desplazado', { x: 110, y: 780, size: 16, font: bold, color: ink })
  page.drawText('Nombre:', { x: 110, y: 720, size: 11, font, color: ink })
  const f = doc.getForm().createTextField('recorte.nombre')
  f.addToPage(page, { x: 170, y: 712, width: 240, height: 22, borderWidth: 1, borderColor: gray })
  return doc.save()
}

const files = {
  'formulario.pdf': await formPdf(),
  'contrato-plano.pdf': await flatPdf(),
  'rotada.pdf': await rotatedPdf(),
  'protegido.pdf': await protectedPdf(),
  'contrasena.pdf': await passwordPdf(),
  'recorte.pdf': await croppedPdf(),
}
for (const [name, bytes] of Object.entries(files)) {
  writeFileSync(new URL(name, out), bytes)
  console.log(name, bytes.length, 'bytes')
}

