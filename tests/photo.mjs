// Signature from a photo: from this device, from the phone, then recolor and
// the grip on a small mark. Usage: node tests/photo.mjs
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173'
const OUT = process.env.OUT_DIR ?? './'
const FIX = new URL('./fixtures/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
mkdirSync(OUT, { recursive: true })
const problems = []
const log = []
const watch = (page, tag) => {
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && problems.push(`[${tag}] ${m.text()}`))
  page.on('pageerror', (e) => problems.push(`[${tag}] pageerror: ${e.message}`))
}

const browser = await chromium.launch({ channel: 'chrome' })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true })
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
const page = await ctx.newPage()
watch(page, 'pc')
await page.goto(BASE + '/')

// A phone photo of a signature: blue ink, paper with a shadow, grain and specks.
// Made once, so test runs don't rewrite the committed fixture.
const PHOTO = FIX + 'firma-foto.jpg'
const jpeg = existsSync(PHOTO) ? null : await page.evaluate(() => {
  const c = document.createElement('canvas')
  c.width = 1600
  c.height = 1000
  const x = c.getContext('2d')
  const g = x.createLinearGradient(0, 0, 1600, 1000)
  g.addColorStop(0, '#f3f0e8')
  g.addColorStop(1, '#a9a49a')
  x.fillStyle = g
  x.fillRect(0, 0, 1600, 1000)
  for (let i = 0; i < 9000; i++) {
    x.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`
    x.fillRect(Math.random() * 1600, Math.random() * 1000, 2, 2)
  }
  x.fillStyle = 'rgba(60,60,60,0.55)'
  for (let i = 0; i < 6; i++) x.fillRect(Math.random() * 1600, Math.random() * 1000, 3, 3)
  x.strokeStyle = '#1f3c8f'
  x.lineCap = 'round'
  x.lineJoin = 'round'
  x.lineWidth = 9
  x.beginPath()
  x.moveTo(320, 640)
  x.bezierCurveTo(380, 300, 470, 260, 430, 560)
  x.bezierCurveTo(420, 700, 520, 660, 560, 560)
  for (let i = 0; i < 6; i++) {
    const bx = 560 + i * 95
    x.bezierCurveTo(bx + 20, 470, bx + 70, 470, bx + 60, 560)
    x.bezierCurveTo(bx + 55, 620, bx + 90, 630, bx + 95, 560)
  }
  x.stroke()
  x.lineWidth = 7
  x.beginPath()
  x.moveTo(300, 720)
  x.bezierCurveTo(600, 680, 1000, 760, 1240, 690)
  x.stroke()
  return c.toDataURL('image/jpeg', 0.82)
})
if (jpeg) writeFileSync(PHOTO, Buffer.from(jpeg.split(',')[1], 'base64'))

// 1) From this device, into the form's signature field.
await page.locator('input[type=file]').setInputFiles(FIX + 'formulario.pdf')
await page.locator('.page canvas').first().waitFor()
await page.getByRole('button', { name: /Firmar aquí/ }).click()
await page.getByRole('tab', { name: 'Foto' }).click()
await page.locator('.photo-start').waitFor()
await page.screenshot({ path: OUT + 'p-start.png' })
await page.locator('.photo-start input[type=file]:not([capture])').setInputFiles(FIX + 'firma-foto.jpg')
await page.locator('.photo-edit__art').waitFor({ timeout: 15000 })
await page.waitForTimeout(400)
log.push(`detected ink color picks Azul: ${await page.getByRole('radio', { name: /Azul/ }).getAttribute('aria-checked')}`)
await page.screenshot({ path: OUT + 'p-traced.png' })
await page.locator('.slider input').nth(1).fill('2')
await page.waitForTimeout(600)
await page.screenshot({ path: OUT + 'p-thick.png' })
await page.locator('.sign .ink-picker__native').fill('#7a1fa2')
await page.waitForTimeout(200)
const fill = await page.locator('.photo-edit__art g').getAttribute('fill')
log.push(`custom color applied to preview: ${fill}`)
await page.getByRole('button', { name: 'Usar firma' }).click()
await page.locator('.item[data-type="signature"]').waitFor()
log.push(`placed photo signature paths: ${await page.locator('.item[data-type="signature"] path').count()}`)

// Recolor after placing, from the item's toolbar.
await page.getByRole('button', { name: 'Tinta negra' }).click()
log.push(`recolored to: ${await page.locator('.item[data-type="signature"] g').getAttribute('fill')}`)

// 2) A small mark gets a grip outside it, and the grip drags it.
await page.getByRole('button', { name: 'Marca' }).click()
const box = await page.locator('.page').first().boundingBox()
await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.3)
const grip = page.locator('.item[data-type="mark"] .item__grip')
log.push(`small mark shows a grip: ${await grip.isVisible()}`)
const before = await page.locator('.item[data-type="mark"]').boundingBox()
const g = await grip.boundingBox()
await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
await page.mouse.down()
await page.mouse.move(g.x - 60, g.y + 40, { steps: 6 })
await page.mouse.up()
const after = await page.locator('.item[data-type="mark"]').boundingBox()
log.push(`grip drag moved the mark by ${Math.round(after.x - before.x)}, ${Math.round(after.y - before.y)}`)
await page.screenshot({ path: OUT + 'p-placed.png' })
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Descargar/ }).click()])
await dl.saveAs(OUT + 'p-firmado.pdf')
log.push('downloaded p-firmado.pdf')

// 3) From the phone: the photo travels sealed and opens in the Foto tab.
await page.getByRole('button', { name: 'Firmar', exact: true }).click()
await page.getByRole('tab', { name: /Con el celular/ }).click()
await page.locator('.qr path').waitFor()
await page.getByRole('button', { name: 'Copiar enlace' }).click()
const url = await page.evaluate(() => navigator.clipboard.readText())
const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const phone = await phoneCtx.newPage()
watch(phone, 'phone')
await phone.goto(url)
await phone.getByRole('radio', { name: /Foto/ }).tap()
await phone.locator('.phone-photo input[type=file]:not([capture])').setInputFiles(FIX + 'firma-foto.jpg')
await phone.locator('.phone-photo__preview').waitFor()
await phone.screenshot({ path: OUT + 'p-phone.png' })
await phone.getByRole('button', { name: 'Usar foto' }).tap()
await phone.locator('.phone-page__done').waitFor()
await page.locator('.photo-edit__note').waitFor({ timeout: 15000 })
await page.locator('.photo-edit__art').waitFor({ timeout: 15000 })
await page.waitForTimeout(300)
await page.screenshot({ path: OUT + 'p-from-phone.png' })
log.push(`phone photo arrived in Foto tab: ${await page.locator('.photo-edit__note').textContent()}`)

await phoneCtx.close()
await browser.close()
console.log(log.join('\n'))
console.log(problems.length ? problems.join('\n') : 'no problems')
