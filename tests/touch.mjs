// The phone editor: pinch to zoom the document, drag to move around it, the
// finger that shows where to tap, the drag grip, tapping off a signature, copy and paste.
// Usage: node tests/touch.mjs
import { mkdirSync } from 'node:fs'
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
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && problems.push(`console.${m.type()}: ${m.text()}`))
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
const cdp = await ctx.newCDPSession(page)
const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints })
const drag = async (x, y, dx, dy) => {
  await touch('touchStart', [{ x, y }])
  for (let i = 1; i <= 10; i++) await touch('touchMove', [{ x: x + (dx * i) / 10, y: y + (dy * i) / 10 }])
  await touch('touchEnd', [])
  await page.waitForTimeout(300)
}
const pinch = async (x, y, from, to) => {
  await touch('touchStart', [{ x: x - from, y, id: 1 }, { x: x + from, y, id: 2 }])
  for (let i = 1; i <= 12; i++) {
    const d = from + ((to - from) * i) / 12
    await touch('touchMove', [{ x: x - d, y, id: 1 }, { x: x + d, y, id: 2 }])
  }
  await touch('touchEnd', [])
  await page.waitForTimeout(400)
}
const view = () =>
  page.evaluate(() => {
    const v = document.querySelector('.viewport')
    return { top: v.scrollTop, left: v.scrollLeft, zoom: parseInt(document.querySelector('.topbar__pct').textContent), scale: visualViewport.scale }
  })
// Where a screen point falls on the first page, in page points.
const pagePoint = (x, y) =>
  page.evaluate(
    ([x, y]) => {
      const r = document.querySelector('.page').getBoundingClientRect()
      const zoom = parseInt(document.querySelector('.topbar__pct').textContent) / 100
      return { x: (x - r.left) / zoom, y: (y - r.top) / zoom }
    },
    [x, y],
  )

await page.goto(BASE + '/')
await page.locator('input[type=file]').setInputFiles(FIX + 'contrato-plano.pdf')
await page.locator('.page canvas').first().waitFor()
await page.waitForTimeout(400)

// Pinch: the document zooms, the browser doesn't, and the point under the fingers stays put.
const start = await view()
const before = await pagePoint(200, 420)
await pinch(200, 420, 40, 120)
const zoomed = await view()
const after = await pagePoint(200, 420)
check(zoomed.zoom > start.zoom * 2, `pinch out zooms the document (${start.zoom}% to ${zoomed.zoom}%)`)
check(zoomed.scale === 1, 'the browser itself does not zoom')
check(Math.hypot(after.x - before.x, after.y - before.y) < 4, `point under the fingers stays (moved ${Math.hypot(after.x - before.x, after.y - before.y).toFixed(1)}pt)`)
await page.screenshot({ path: OUT + 't-pinched.png' })

// One finger moves around the zoomed page, both ways.
await drag(300, 500, -160, -200)
const panned = await view()
check(panned.left > zoomed.left + 100 && panned.top > zoomed.top + 100, `drag moves around (left ${zoomed.left} to ${panned.left}, top ${zoomed.top} to ${panned.top})`)
await pinch(200, 420, 120, 30)
check((await view()).zoom < zoomed.zoom, 'pinch in zooms back out')
// The zoom buttons are hidden on a phone; back to the fitted width for the rest.
await page.locator('.topbar__pct').evaluate((el) => el.click())
await page.waitForTimeout(300)

// The finger shows where to tap once a signature is ready to place.
await page.getByRole('button', { name: 'Firmar', exact: true }).tap()
const pad = page.locator('.sign-dialog .pad')
await pad.waitFor()
const box = await pad.boundingBox()
await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.6)
await page.mouse.down()
for (let t = 0; t <= 1; t += 0.05) await page.mouse.move(box.x + box.width * (0.15 + t * 0.7), box.y + box.height * (0.6 - Math.sin(t * Math.PI * 3) * 0.2))
await page.mouse.up()
await page.getByRole('button', { name: 'Usar firma' }).tap()
await page.locator('.tap-hint').waitFor()
check(await page.locator('.tap-hint__hand').isVisible(), 'a finger shows where to tap')
check((await page.locator('.tap-hint__ghost .sig-art, .tap-hint__ghost img, .tap-hint__ghost svg').count()) > 0, 'the signature shows up under the finger')
await page.waitForTimeout(900)
await page.screenshot({ path: OUT + 't-hint.png' })
const first = await page.locator('.page').first().boundingBox()
await page.touchscreen.tap(first.x + first.width * 0.4, first.y + 260)
await page.locator('.item[data-type="signature"]').waitFor()
await page.waitForTimeout(400)
check((await page.locator('.tap-hint').count()) === 0, 'the finger leaves once the signature is placed')
check((await page.locator('.item[data-selected]').count()) === 1, 'the new signature is selected')

// On a phone the drag grip always shows, centered under the item.
const body = await page.locator('.item[data-type="signature"] .item__body').boundingBox()
const grip = page.locator('.item[data-type="signature"] .item__grip')
check(await grip.isVisible(), 'the drag grip shows on a phone, even for a big signature')
const g = await grip.boundingBox()
check(g.y > body.y + body.height && Math.abs(g.x + g.width / 2 - (body.x + body.width / 2)) < 1, 'the grip sits centered under the signature')

// While it drags: no turn or resize handles, and a fainter outline.
const outline = () => page.locator('.item[data-type="signature"] .item__body').evaluate((el) => getComputedStyle(el).outlineColor)
const solid = await outline()
const gx = g.x + g.width / 2
const gy = g.y + g.height / 2
await touch('touchStart', [{ x: gx, y: gy }])
for (let i = 1; i <= 6; i++) await touch('touchMove', [{ x: gx + i * 6, y: gy + i * 4 }])
await page.waitForTimeout(200)
const during = await page.locator('.item[data-type="signature"]').evaluate((el) => ({
  dragging: el.hasAttribute('data-dragging'),
  handle: getComputedStyle(el.querySelector('.item__handle')).opacity,
  turn: getComputedStyle(el.querySelector('.item__turn')).opacity,
}))
const faint = await outline()
check(during.dragging && during.handle === '0' && during.turn === '0', `handles hide while dragging (${JSON.stringify(during)})`)
check(faint !== solid, `the outline fades while dragging (${solid} to ${faint})`)
await page.screenshot({ path: OUT + 't-dragging.png' })
await touch('touchEnd', [])
await page.waitForTimeout(250)
const settled = await page.locator('.item[data-type="signature"]').evaluate((el) => ({ dragging: el.hasAttribute('data-dragging'), handle: getComputedStyle(el.querySelector('.item__handle')).opacity }))
check(!settled.dragging && settled.handle === '1', 'handles come back when the finger lifts')
const moved = await page.locator('.item[data-type="signature"] .item__body').boundingBox()
check(Math.round(moved.x - body.x) === 36 && Math.round(moved.y - body.y) === 24, `the grip drags the signature (${Math.round(moved.x - body.x)}, ${Math.round(moved.y - body.y)})`)

// Tapping the page off the signature lets go of it (placing it may have scrolled the page).
const sig = await page.locator('.item[data-type="signature"] .item__body').boundingBox()
await page.touchscreen.tap(sig.x + sig.width / 2, sig.y + sig.height + 90)
await page.waitForTimeout(200)
check((await page.locator('.item[data-selected]').count()) === 0, 'tapping off the signature deselects it')

// Copy from the toolbar, paste from the dock.
await page.locator('.item[data-type="signature"] .item__body').tap()
await page.getByRole('button', { name: 'Copiar' }).tap()
await page.getByRole('button', { name: 'Pegar' }).tap()
await page.waitForTimeout(300)
check((await page.locator('.item[data-type="signature"]').count()) === 2, 'paste adds a second signature')
check((await page.locator('.item[data-selected]').count()) === 1, 'the pasted copy is the one selected')
await page.screenshot({ path: OUT + 't-pasted.png' })
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
check(overflow <= 0, `no sideways overflow (${overflow}px)`)

// The grip shows for every size: a tiny mark, a date, and the signature zoomed in.
const gripShows = async (selector) => {
  const g = await page.locator(`${selector} .item__grip`).boundingBox()
  const b = await page.locator(`${selector} .item__body`).boundingBox()
  return !!g && g.width >= 30 && g.y > b.y + b.height
}
for (const [tool, type, fy] of [['Marca', 'mark', 0.25], ['Fecha', 'text', 0.35]]) {
  await page.getByRole('button', { name: tool, exact: true }).tap()
  const sheetBox = await page.locator('.page').nth(1).boundingBox()
  await page.touchscreen.tap(sheetBox.x + sheetBox.width * 0.3, Math.max(sheetBox.y, 70) + 80 + fy * 100)
  await page.waitForTimeout(300)
  if (await page.locator('.field-sheet').count()) await page.getByRole('button', { name: 'Listo' }).tap()
  check(await gripShows(`.item[data-type="${type}"][data-selected]`), `grip shows under a selected ${type}`)
}
await pinch(200, 420, 40, 120)
const big = page.locator('.item[data-type="signature"] .item__body').last()
await big.scrollIntoViewIfNeeded()
await big.tap()
await page.waitForTimeout(200)
check(await gripShows('.item[data-type="signature"][data-selected]'), 'grip shows under a signature zoomed in')
await page.screenshot({ path: OUT + 't-grip-zoomed.png' })

// A phone whose browser reports a mouse-like pointer still gets the grip.
const fine = await browser.newContext({ viewport: { width: 390, height: 844 } })
const plain = await fine.newPage()
await plain.goto(BASE + '/')
await plain.locator('input[type=file]').setInputFiles(FIX + 'contrato-plano.pdf')
await plain.locator('.page canvas').first().waitFor()
await plain.getByRole('button', { name: 'Firmar', exact: true }).click()
const plainPad = await plain.locator('.sign-dialog .pad').boundingBox()
await plain.mouse.move(plainPad.x + plainPad.width * 0.15, plainPad.y + plainPad.height * 0.6)
await plain.mouse.down()
for (let t = 0; t <= 1; t += 0.05) await plain.mouse.move(plainPad.x + plainPad.width * (0.15 + t * 0.7), plainPad.y + plainPad.height * (0.6 - Math.sin(t * Math.PI * 3) * 0.2))
await plain.mouse.up()
await plain.getByRole('button', { name: 'Usar firma' }).click()
const plainSheet = await plain.locator('.page').first().boundingBox()
await plain.mouse.click(plainSheet.x + plainSheet.width * 0.5, plainSheet.y + 260)
await plain.locator('.item[data-type="signature"][data-selected]').waitFor()
const plainSmall = await plain.locator('.item[data-type="signature"]').evaluate((el) => el.hasAttribute('data-small'))
check(!plainSmall && (await plain.locator('.item[data-type="signature"] .item__grip').isVisible()), 'phone width without touch: the grip shows on a big signature')

// Pages of mixed sizes: the widest fits the screen below 50%, and zooming
// back out lands on that fit, with nothing hanging off the side.
const mixedCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const mixed = await mixedCtx.newPage()
await mixed.goto(BASE + '/')
// The home page can still be pinched; the editor puts the browser back at 1x.
const mixedCdp = await mixedCtx.newCDPSession(mixed)
const mtouch = (type, touchPoints) => mixedCdp.send('Input.dispatchTouchEvent', { type, touchPoints })
const mpinch = async (x, y, from, to) => {
  await mtouch('touchStart', [{ x: x - from, y, id: 1 }, { x: x + from, y, id: 2 }])
  for (let i = 1; i <= 12; i++) {
    const d = from + ((to - from) * i) / 12
    await mtouch('touchMove', [{ x: x - d, y, id: 1 }, { x: x + d, y, id: 2 }])
  }
  await mtouch('touchEnd', [])
  await mixed.waitForTimeout(400)
}
await mixed.locator('.home__intro').waitFor()
await mpinch(195, 400, 30, 110)
check((await mixed.evaluate(() => visualViewport.scale)) > 1, 'the home page can still be pinched')
await mixed.locator('input[type=file]').setInputFiles(FIX + 'tamanos-mixtos.pdf')
await mixed.locator('.page canvas').first().waitFor()
await mixed.waitForTimeout(500)
check((await mixed.evaluate(() => visualViewport.scale)) === 1, 'opening the editor puts the browser back at 1x')
const fitted = await mixed.locator('.topbar__pct').textContent()
await mpinch(300, 400, 30, 130)
await mpinch(200, 400, 150, 20)
await mpinch(200, 400, 150, 20)
const sideways = await mixed.evaluate(() => {
  const v = document.querySelector('.viewport')
  return v.scrollWidth - v.clientWidth
})
check((await mixed.locator('.topbar__pct').textContent()) === fitted && sideways === 0, `zooming out returns to the fit (${fitted}) with no sideways scroll (${sideways}px)`)
await mixed.getByRole('button', { name: 'Ir al inicio' }).evaluate((el) => el.click())
await mixed.locator('.home__intro').waitFor()
check(!(await mixed.evaluate(() => document.querySelector('meta[name=viewport]').content)).includes('maximum-scale'), 'leaving the editor lets the browser zoom again')

// With reduced motion the finger holds still.
const calm = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
const quiet = await calm.newPage()
await quiet.goto(BASE + '/')
await quiet.locator('input[type=file]').setInputFiles(FIX + 'contrato-plano.pdf')
await quiet.locator('.page canvas').first().waitFor()
await quiet.getByRole('button', { name: 'Fecha' }).tap()
await quiet.locator('.tap-hint').waitFor()
const still = await quiet.locator('.tap-hint__hand').evaluate((el) => getComputedStyle(el).animationName)
check(still === 'none', `reduced motion: the finger does not move (${still})`)

await browser.close()
console.log(log.join('\n'))
console.log(problems.length ? problems.join('\n') : 'no problems')
