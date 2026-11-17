// Signing on the phone itself: draw on the pad, tap to place, add text through
// the bottom sheet, download. Usage: node tests/mobile.mjs
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173'
const OUT = process.env.OUT_DIR ?? './'
const FIX = new URL('./fixtures/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
mkdirSync(OUT, { recursive: true })
const problems = []
const log = []

const browser = await chromium.launch({ channel: 'chrome' })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, acceptDownloads: true })
const page = await ctx.newPage()
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && problems.push(`console.${m.type()}: ${m.text()}`))
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))

await page.goto(BASE + '/')
await page.locator('input[type=file]').setInputFiles(FIX + 'contrato-plano.pdf')
await page.locator('.page canvas').first().waitFor()

// Draw with a finger-sized gesture on the full-screen pad.
await page.getByRole('button', { name: 'Firmar', exact: true }).tap()
const pad = page.locator('.sign-dialog .pad')
await pad.waitFor()
log.push(`phone tab hidden on touch: ${(await page.getByRole('tab', { name: /Con el celular/ }).count()) === 0}`)
const box = await pad.boundingBox()
await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.6)
await page.mouse.down()
for (let t = 0; t <= 1; t += 0.04) {
  await page.mouse.move(box.x + box.width * (0.15 + t * 0.7), box.y + box.height * (0.6 - Math.sin(t * Math.PI * 4) * 0.18))
}
await page.mouse.up()
await page.waitForTimeout(300)
await page.screenshot({ path: OUT + 'm-pad.png' })
await page.getByRole('button', { name: 'Usar firma' }).tap()
await page.locator('.hint').waitFor()
await page.screenshot({ path: OUT + 'm-armed.png' })

// Tap the page to place it.
const first = await page.locator('.page').first().boundingBox()
await page.touchscreen.tap(first.x + first.width * 0.4, first.y + 300)
await page.locator('.item[data-type="signature"]').waitFor()
log.push('signature placed by tap')

// Free text goes through the bottom sheet at 16px.
await page.getByRole('button', { name: 'Texto' }).tap()
await page.touchscreen.tap(first.x + first.width * 0.2, first.y + 420)
await page.locator('.field-sheet input').waitFor()
const fontSize = await page.locator('.field-sheet input').evaluate((el) => getComputedStyle(el).fontSize)
log.push(`sheet input font-size: ${fontSize}`)
await page.locator('.field-sheet input').fill('Recibí conforme')
await page.screenshot({ path: OUT + 'm-sheet.png' })
await page.getByRole('button', { name: 'Listo' }).tap()
const text = await page.locator('.item[data-type="text"]').textContent()
log.push(`text item: "${text}"`)
await page.waitForTimeout(300)
await page.screenshot({ path: OUT + 'm-placed.png' })

const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Descargar/ }).tap()])
await download.saveAs(OUT + 'm-firmado.pdf')
log.push(`downloaded ${download.suggestedFilename()}`)
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
log.push(`horizontal overflow: ${overflow}px`)

await browser.close()
console.log(log.join('\n'))
console.log(problems.length ? problems.join('\n') : 'no problems')
