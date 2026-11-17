// End-to-end walk through the app in the installed Chrome.
// Usage: node tests/e2e.mjs [scenario] (default: all). Needs `npm run dev`.
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173'
const OUT = process.env.OUT_DIR ?? new URL('../tests/out/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
const FIX = new URL('./fixtures/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
mkdirSync(OUT, { recursive: true })

const only = process.argv[2]
const problems = []

function watch(page, label) {
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') problems.push(`[${label}] console.${msg.type()}: ${msg.text()}`)
  })
  page.on('pageerror', (err) => problems.push(`[${label}] pageerror: ${err.message}`))
  page.on('requestfailed', (req) => {
    const failure = req.failure()?.errorText ?? ''
    if (!/ERR_ABORTED/.test(failure)) problems.push(`[${label}] requestfailed: ${req.url()} ${failure}`)
  })
}

// A loopy, left-to-right scribble with a flourish: enough like a signature.
function signaturePoints(box) {
  const pts = []
  const left = box.x + box.width * 0.12
  const base = box.y + box.height * 0.62
  for (let t = 0; t <= Math.PI * 9; t += 0.18) {
    const x = left + t * (box.width * 0.024) - Math.sin(t) * box.width * 0.03
    const y = base - box.height * 0.16 - Math.cos(t) * box.height * 0.16 + Math.sin(t / 3) * 6
    pts.push([x, y])
  }
  const flourish = []
  for (let t = 0; t <= 1; t += 0.05) {
    flourish.push([left + box.width * (0.05 + t * 0.72), base + box.height * 0.08 - Math.sin(t * Math.PI) * box.height * 0.05])
  }
  return [pts, flourish]
}

async function drawOn(page, selector) {
  const pad = page.locator(selector)
  await pad.waitFor()
  const box = await pad.boundingBox()
  for (const stroke of signaturePoints(box)) {
    await page.mouse.move(stroke[0][0], stroke[0][1])
    await page.mouse.down()
    for (const [x, y] of stroke.slice(1)) await page.mouse.move(x, y, { steps: 2 })
    await page.mouse.up()
  }
}

async function openFixture(page, name) {
  await page.goto(BASE + '/')
  await page.locator('input[type=file]').setInputFiles(FIX + name)
  await page.locator('.page canvas').first().waitFor({ timeout: 20000 })
}

async function download(page, file) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Descargar/ }).click()])
  const path = OUT + file
  await dl.saveAs(path)
  return path
}

async function scenarioForm(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, colorScheme: 'light' })
  const page = await ctx.newPage()
  watch(page, 'form')
  await page.goto(BASE + '/')
  await page.waitForTimeout(600)
  await page.screenshot({ path: OUT + 'home-desktop.png' })

  await openFixture(page, 'formulario.pdf')
  await page.waitForTimeout(500)
  await page.screenshot({ path: OUT + 'form-open.png' })

  await page.locator('[data-field-name="cliente.nombre"]').fill('María Fernanda López Ruiz')
  await page.locator('[data-field-name="cliente.correo"]').fill('maria.lopez@correo.mx')
  await page.locator('[data-field-name="cliente.estado"]').selectOption('Nuevo León')
  await page.locator('[data-field-name="servicio.plan"]').nth(1).click()
  await page.locator('[data-field-name="servicio.notas"]').fill('Instalar el lunes por la mañana.\nTocar el timbre dos veces.')
  await page.locator('[data-field-name="servicio.acepto"]').click()

  // Sign the signature field through its slot.
  await page.getByRole('button', { name: /Firmar aquí/ }).click()
  await page.locator('.sign-dialog .pad').waitFor()
  await page.screenshot({ path: OUT + 'sign-dialog-draw.png' })
  await drawOn(page, '.sign-dialog .pad')
  await page.screenshot({ path: OUT + 'sign-dialog-drawn.png' })
  await page.getByRole('button', { name: 'Usar firma' }).click()
  await page.locator('.item[data-type="signature"]').waitFor()

  // A date and a check mark placed by hand.
  await page.getByRole('button', { name: 'Fecha' }).click()
  const pageBox = await page.locator('.page').first().boundingBox()
  await page.mouse.move(pageBox.x + pageBox.width * 0.62, pageBox.y + pageBox.height * 0.6)
  await page.screenshot({ path: OUT + 'form-armed-date.png' })
  await page.mouse.click(pageBox.x + pageBox.width * 0.62, pageBox.y + pageBox.height * 0.6)
  await page.getByRole('button', { name: 'Marca' }).click()
  await page.mouse.click(pageBox.x + pageBox.width * 0.1, pageBox.y + pageBox.height * 0.7)
  await page.getByRole('button', { name: 'Texto' }).click()
  await page.mouse.click(pageBox.x + pageBox.width * 0.14, pageBox.y + pageBox.height * 0.705)
  await page.keyboard.type('Sí, en el horario de la tarde')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  await page.screenshot({ path: OUT + 'form-filled.png' })

  const out = await download(page, 'formulario-firmado.pdf')
  await page.waitForTimeout(400)
  await page.screenshot({ path: OUT + 'form-downloaded.png' })
  await ctx.close()
  return out
}

async function scenarioPhone(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
  const page = await ctx.newPage()
  watch(page, 'pc')
  await openFixture(page, 'contrato-plano.pdf')
  await page.getByRole('button', { name: 'Firmar' }).click()
  await page.getByRole('tab', { name: /Con el celular/ }).click()
  await page.locator('.qr path').waitFor()
  await page.waitForTimeout(300)
  await page.screenshot({ path: OUT + 'phone-qr.png' })
  await page.getByRole('button', { name: 'Copiar enlace' }).click()
  const url = await page.evaluate(() => navigator.clipboard.readText())

  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true })
  const phone = await phoneCtx.newPage()
  watch(phone, 'phone')
  await phone.goto(url)
  await phone.locator('.phone-turn').waitFor()
  await page.locator('.phone__status--live').waitFor({ timeout: 8000 })
  await page.screenshot({ path: OUT + 'phone-pc-connected.png' })
  await phone.waitForTimeout(300)
  await phone.screenshot({ path: OUT + 'phone-page.png' })
  // Upright, the same full-screen pad opens on request.
  await phone.getByRole('button', { name: 'Firmar en vertical' }).click()
  await phone.locator('.phone-stage[data-open="true"]').waitFor()
  await phone.waitForTimeout(250)
  await phone.screenshot({ path: OUT + 'phone-stage-portrait.png' })
  await phone.getByRole('button', { name: 'Salir de pantalla completa' }).click()
  await phone.locator('.phone-stage[data-open="false"]').waitFor({ state: 'attached' })
  // Turning the phone opens it by itself.
  await phone.setViewportSize({ width: 844, height: 390 })
  await phone.locator('.phone-stage[data-open="true"]').waitFor()
  await phone.waitForTimeout(250)
  await phone.screenshot({ path: OUT + 'phone-stage-landscape.png' })
  await drawOn(phone, '.phone-stage__pad')
  await phone.screenshot({ path: OUT + 'phone-page-drawn.png' })
  await phone.locator('.phone-stage').getByRole('button', { name: 'Usar firma' }).click()
  await phone.locator('.phone-page__done').waitFor()
  await phone.screenshot({ path: OUT + 'phone-sent.png' })

  await page.locator('.phone-done__paper svg').waitFor({ timeout: 8000 })
  await page.screenshot({ path: OUT + 'phone-pc-received.png' })
  await page.getByRole('button', { name: 'Usar firma' }).click()
  // Second page: bring its signature line to the middle of the screen first,
  // the way a person scrolls it out from under the dock.
  const second = page.locator('.page').nth(1)
  await page.evaluate(() => {
    const viewport = document.querySelector('.viewport')
    const target = document.querySelectorAll('.page')[1]
    const line = target.getBoundingClientRect().top + target.getBoundingClientRect().height * 0.74
    viewport.scrollBy(0, line - viewport.getBoundingClientRect().height / 2)
  })
  await page.waitForTimeout(200)
  const box = await second.boundingBox()
  await page.mouse.click(box.x + box.width * 0.29, box.y + box.height * 0.765)
  await page.locator('.item[data-type="signature"]').waitFor()
  await page.getByRole('button', { name: 'Texto' }).click()
  await page.mouse.click(box.x + box.width * 0.32, box.y + box.height * 0.675)
  await page.keyboard.type('Ramiro Esquivel Ortega')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Fecha' }).click()
  await page.mouse.click(box.x + box.width * 0.175, box.y + box.height * 0.718)
  await page.waitForTimeout(300)
  await page.screenshot({ path: OUT + 'phone-placed.png' })
  const out = await download(page, 'contrato-firmado.pdf')
  await phoneCtx.close()
  await ctx.close()
  return out
}

async function scenarioMobileEditor(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, colorScheme: 'dark' })
  const page = await ctx.newPage()
  watch(page, 'mobile')
  await page.goto(BASE + '/')
  await page.waitForTimeout(500)
  await page.screenshot({ path: OUT + 'home-mobile-dark.png', fullPage: true })
  await openFixture(page, 'formulario.pdf')
  await page.waitForTimeout(400)
  await page.screenshot({ path: OUT + 'mobile-editor.png' })
  await page.locator('[data-field-name="cliente.nombre"]').tap()
  await page.locator('.field-sheet input').waitFor()
  await page.locator('.field-sheet input').fill('Daniela Ochoa')
  await page.screenshot({ path: OUT + 'mobile-sheet.png' })
  await page.getByRole('button', { name: 'Siguiente' }).tap()
  await page.waitForTimeout(400)
  await page.screenshot({ path: OUT + 'mobile-sheet-next.png' })
  await page.getByRole('button', { name: 'Listo' }).tap()
  await page.getByRole('button', { name: 'Firmar', exact: true }).tap()
  await page.locator('.sign-dialog .pad').waitFor()
  await page.screenshot({ path: OUT + 'mobile-sign.png' })
  await ctx.close()
}

async function scenarioOddPdfs(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true })
  const page = await ctx.newPage()
  watch(page, 'odd')
  const results = {}
  for (const name of ['rotada.pdf', 'recorte.pdf', 'protegido.pdf']) {
    await openFixture(page, name)
    const field = page.locator('.pdf-field--text').first()
    if (await field.count()) await field.fill('Prueba de posición')
    await page.getByRole('button', { name: 'Marca' }).click()
    const box = await page.locator('.page').first().boundingBox()
    await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.3)
    await page.screenshot({ path: OUT + `odd-${name}.png` })
    results[name] = await download(page, `odd-${name}`)
    await page.getByRole('button', { name: 'Ir al inicio' }).click()
    const discard = page.getByRole('button', { name: 'Cerrar sin descargar' })
    if (await discard.isVisible().catch(() => false)) await discard.click()
  }
  // A PDF with an opening password.
  await page.goto(BASE + '/')
  await page.locator('input[type=file]').setInputFiles(FIX + 'contrasena.pdf')
  await page.getByLabel('Contraseña del PDF').fill('mal')
  await page.getByRole('button', { name: 'Abrir' }).click()
  await page.locator('.password__error').waitFor()
  await page.screenshot({ path: OUT + 'password-wrong.png' })
  await page.getByLabel('Contraseña del PDF').fill('1234')
  await page.getByRole('button', { name: 'Abrir' }).click()
  await page.locator('.page canvas').first().waitFor({ timeout: 15000 })
  await page.screenshot({ path: OUT + 'password-open.png' })
  await ctx.close()
  return results
}

const browser = await chromium.launch({ channel: 'chrome' })
const outputs = {}
try {
  if (!only || only === 'form') outputs.form = await scenarioForm(browser)
  if (!only || only === 'phone') outputs.phone = await scenarioPhone(browser)
  if (!only || only === 'mobile') await scenarioMobileEditor(browser)
  if (!only || only === 'odd') outputs.odd = await scenarioOddPdfs(browser)
} catch (error) {
  problems.push(`FAILED: ${error.stack ?? error}`)
} finally {
  await browser.close()
}
writeFileSync(OUT + 'e2e-report.json', JSON.stringify({ outputs, problems }, null, 2))
console.log(JSON.stringify({ outputs, problems }, null, 2))
