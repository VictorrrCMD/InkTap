// Turning placed items (buttons, keys, handle), downloading the signature as
// SVG and PNG, and exporting turned items. Usage: node tests/rotate.mjs
import { mkdirSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173'
const OUT = process.env.OUT_DIR ?? './'
const FIX = new URL('./fixtures/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
mkdirSync(OUT, { recursive: true })
const problems = []
const log = []
const check = (ok, label) => {
  log.push(`${ok ? 'ok  ' : 'FAIL'} ${label}`)
  if (!ok) problems.push(label)
}

const browser = await chromium.launch({ channel: 'chrome' })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true })
const page = await ctx.newPage()
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`))
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))

const angle = (locator) =>
  locator.evaluate((el) => {
    const m = getComputedStyle(el).transform
    if (!m || m === 'none') return 0
    const [a, b] = m.slice(7, -1).split(',').map(Number)
    return Math.round(((Math.atan2(b, a) * 180) / Math.PI + 360) % 360)
  })

async function draw(selector) {
  const box = await page.locator(selector).boundingBox()
  const y = box.y + box.height * 0.6
  await page.mouse.move(box.x + box.width * 0.15, y)
  await page.mouse.down()
  for (let i = 1; i <= 24; i++) {
    const t = i / 24
    await page.mouse.move(box.x + box.width * (0.15 + 0.7 * t), y - Math.sin(t * Math.PI * 3) * box.height * 0.22, { steps: 2 })
  }
  await page.mouse.up()
}

async function open(name) {
  await page.goto(BASE + '/')
  await page.locator('input[type=file]').setInputFiles(FIX + name)
  await page.locator('.page canvas').first().waitFor()
}

async function download(trigger, path) {
  const [dl] = await Promise.all([page.waitForEvent('download'), trigger()])
  await dl.saveAs(path)
  return path
}

// A drawn signature placed in the form's signature field.
await open('formulario.pdf')
await page.getByRole('button', { name: /Firmar aquí/ }).click()
await draw('.draw__pad')
await page.getByRole('button', { name: 'Usar firma' }).click()
const sig = page.locator('.item[data-type="signature"]')
const body = sig.locator('.item__body')
await body.waitFor()

await page.getByRole('button', { name: 'Girar a la derecha' }).click()
check((await angle(body)) === 90, `button turns 90 degrees: ${await angle(body)}`)
check((await page.locator('.item-bar__value--angle').textContent()) === '90°', 'toolbar shows the angle')
await sig.focus()
await page.keyboard.press('Shift+R')
check((await angle(body)) === 0, `Shift+R turns back: ${await angle(body)}`)
for (let i = 0; i < 3; i++) await page.keyboard.press(']')
check((await angle(body)) === 15, `] three times is 15 degrees: ${await angle(body)}`)
await page.keyboard.press('Control+z')
check((await angle(body)) === 10, `Ctrl+Z undoes one step: ${await angle(body)}`)

// Drag the round handle around the center. Undo clears the selection first.
await body.click()
const center = await sig.boundingBox().then((b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 }))
const handle = await sig.locator('.item__turn').boundingBox()
const hx = handle.x + handle.width / 2
const hy = handle.y + handle.height / 2
const r = Math.hypot(hx - center.x, hy - center.y)
const a0 = Math.atan2(hy - center.y, hx - center.x)
await page.mouse.move(hx, hy)
await page.mouse.down()
for (let i = 1; i <= 10; i++) {
  const a = a0 + ((35 * Math.PI) / 180) * (i / 10)
  await page.mouse.move(center.x + r * Math.cos(a), center.y + r * Math.sin(a))
}
await page.mouse.up()
const dragged = await angle(body)
check(dragged >= 40 && dragged <= 50, `handle drag turns freely: ${dragged}`)
await page.screenshot({ path: OUT + 'rot-signature.png' })

// Download as SVG and PNG.
await page.getByRole('button', { name: 'Descargar firma' }).click()
await page.locator('.item-menu').waitFor()
await page.screenshot({ path: OUT + 'rot-menu.png' })
const svgPath = await download(() => page.getByRole('menuitem', { name: /SVG/ }).click(), OUT + 'firma.svg')
const svg = readFileSync(svgPath, 'utf8')
check(svg.startsWith('<svg') && svg.includes('<path') && svg.includes(`rotate(${dragged})`), `SVG has paths and the turn (${svg.length} bytes)`)
await page.getByRole('button', { name: 'Descargar firma' }).click()
await page.keyboard.press('ArrowDown')
const pngPath = await download(() => page.keyboard.press('Enter'), OUT + 'firma.png')
const png = readFileSync(pngPath)
const pw = png.readUInt32BE(16)
const ph = png.readUInt32BE(20)
check(png.subarray(1, 4).toString() === 'PNG' && Math.max(pw, ph) >= 1200, `PNG ${pw}x${ph}`)
const alpha = await page.evaluate(async (b64) => {
  const img = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/png' }))
  const c = new OffscreenCanvas(img.width, img.height)
  const x = c.getContext('2d')
  x.drawImage(img, 0, 0)
  const d = x.getImageData(0, 0, img.width, img.height).data
  let clear = 0
  for (let i = 3; i < d.length; i += 4) if (d[i] === 0) clear++
  return clear / (d.length / 4)
}, png.toString('base64'))
check(alpha > 0.5, `PNG background is transparent (${Math.round(alpha * 100)}% clear)`)

// Text and a mark, turned too.
await page.getByRole('button', { name: 'Texto' }).click()
const pg = await page.locator('.page').first().boundingBox()
await page.mouse.click(pg.x + pg.width * 0.68, pg.y + pg.height * 0.468)
await page.keyboard.type('Girado 90')
await page.keyboard.press('Enter')
check((await page.locator('.item[data-type="text"] .item__text').textContent()) === 'Girado 90', 'text typed into the new item')
await page.locator('.item[data-type="text"][data-selected]:not([data-editing]) .item-bar').waitFor()
await page.getByRole('button', { name: 'Girar a la derecha' }).click()
check((await angle(page.locator('.item[data-type="text"] .item__body'))) === 90, 'text turns 90 degrees')
await page.getByRole('button', { name: 'Marca' }).click()
await page.mouse.click(pg.x + pg.width * 0.82, pg.y + pg.height * 0.35)
for (let i = 0; i < 6; i++) await page.keyboard.press(']')
check((await angle(page.locator('.item[data-type="mark"] .item__body'))) === 30, 'mark turns with ]')
await page.mouse.click(pg.x + 20, pg.y + pg.height - 20)
await page.screenshot({ path: OUT + 'rot-page.png' })
await download(() => page.getByRole('button', { name: /Descargar/ }).first().click(), OUT + 'rot-formulario.pdf')

// A page that is itself rotated in the PDF.
await open('rotada.pdf')
await page.getByRole('button', { name: 'Firmar', exact: true }).click()
await draw('.draw__pad')
await page.getByRole('button', { name: 'Usar firma' }).click()
const rp = await page.locator('.page').first().boundingBox()
await page.mouse.click(rp.x + rp.width * 0.5, rp.y + rp.height * 0.45)
await page.locator('.item[data-type="signature"]').waitFor()
for (let i = 0; i < 6; i++) await page.keyboard.press('[')
await page.mouse.click(rp.x + 10, rp.y + rp.height - 10)
await page.screenshot({ path: OUT + 'rot-rotada.png' })
await download(() => page.getByRole('button', { name: /Descargar/ }).first().click(), OUT + 'rot-rotada.pdf')

await browser.close()
console.log(log.join('\n'))
console.log(problems.length ? problems.join('\n') : 'no problems')
