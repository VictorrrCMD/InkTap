// Selecting on a computer: click off to let go, Shift or Ctrl to pick several,
// drag them together, copy, cut, paste, duplicate, undo, redo, Ctrl+wheel zoom.
// Usage: node tests/select.mjs
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
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } })
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && problems.push(`console.${m.type()}: ${m.text()}`))
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))

await page.goto(BASE + '/')
await page.locator('input[type=file]').setInputFiles(FIX + 'contrato-plano.pdf')
await page.locator('.page canvas').first().waitFor()
await page.waitForTimeout(300)

const sheet = page.locator('.page').first()
const at = async (fx, fy) => {
  const b = await sheet.boundingBox()
  return { x: b.x + b.width * fx, y: b.y + b.height * fy }
}
const place = async (tool, fx, fy) => {
  await page.getByRole('button', { name: tool, exact: true }).click()
  const p = await at(fx, fy)
  await page.mouse.click(p.x, p.y)
  await page.waitForTimeout(120)
}
const items = () => page.locator('.item').count()
const picked = () => page.locator('.item[data-selected]').count()
const marks = page.locator('.item[data-type="mark"] .item__body')
const positions = () => page.locator('.item').evaluateAll((els) => els.map((e) => [parseFloat(e.style.left), parseFloat(e.style.top)]))

await place('Marca', 0.3, 0.42)
await place('Marca', 0.5, 0.42)
await place('Fecha', 0.3, 0.5)
check((await items()) === 3, 'three items placed')
check((await picked()) === 1, 'the last one placed is selected')
// On a computer the grip shows only for items too small to grab, and goes under them.
const tiny = await page.locator('.item[data-type="mark"]').first().evaluate((el) => el.hasAttribute('data-small'))
await page.locator('.item[data-type="mark"] .item__body').first().click()
const gripBox = await page.locator('.item[data-type="mark"] .item__grip').first().boundingBox()
const markBox = await page.locator('.item[data-type="mark"] .item__body').first().boundingBox()
check(tiny && gripBox && gripBox.y > markBox.y + markBox.height, 'a small mark shows its grip underneath')

// Clicking the page itself, off the item, lets go of it.
let p = await at(0.7, 0.62)
await page.mouse.click(p.x, p.y)
check((await picked()) === 0, 'click on the page deselects')
await marks.nth(0).click()
const gutter = await sheet.boundingBox()
await page.mouse.click(gutter.x - 20, gutter.y + 200)
check((await picked()) === 0, 'click on the gray around the page deselects')

// Shift and Ctrl add to the selection; Ctrl on a picked one takes it out.
await marks.nth(0).click()
await marks.nth(1).click({ modifiers: ['Shift'] })
await page.locator('.item[data-type="text"] .item__body').click({ modifiers: ['Control'] })
check((await picked()) === 3, 'Shift and Ctrl click pick three')
check(await page.locator('.item-bar__count').isVisible(), 'the toolbar counts the selection')
await page.screenshot({ path: OUT + 's-multi.png' })
await marks.nth(1).click({ modifiers: ['Control'] })
check((await picked()) === 2, 'Ctrl click on a picked one takes it out')

// Dragging one moves every picked item by the same amount.
const before = await positions()
const grab = await marks.nth(0).boundingBox()
await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2)
await page.mouse.down()
await page.mouse.move(grab.x + grab.width / 2 + 40, grab.y + grab.height / 2 + 30, { steps: 6 })
await page.mouse.up()
const moved = await positions()
const delta = moved.map((m, i) => [Math.round(m[0] - before[i][0]), Math.round(m[1] - before[i][1])])
check(delta[0][0] === 40 && delta[0][1] === 30 && delta[2][0] === 40 && delta[2][1] === 30 && delta[1][0] === 0, `drag moves the picked ones together (${JSON.stringify(delta)})`)
check((await picked()) === 2, 'the selection survives the drag')

// Arrow keys move the selection; undo puts it back and keeps it selected.
await page.keyboard.press('Shift+ArrowRight')
const nudged = await positions()
check(Math.round(nudged[0][0] - moved[0][0]) > 0 && Math.round(nudged[2][0] - moved[2][0]) > 0, 'Shift+arrow moves both')
await page.keyboard.press('Control+z')
await page.keyboard.press('Control+z')
const undone = await positions()
check(JSON.stringify(undone) === JSON.stringify(before), 'Ctrl+Z twice undoes the nudge and the drag')
check((await picked()) === 2, 'the selection survives undo')
await page.keyboard.press('Control+y')
check(JSON.stringify(await positions()) === JSON.stringify(moved), 'Ctrl+Y redoes the drag')
await page.keyboard.press('Control+Shift+z')
check(JSON.stringify(await positions()) === JSON.stringify(nudged), 'Ctrl+Shift+Z redoes the nudge')

// Copy and paste: the copies land nudged and come in selected; pasting again nudges further.
await page.keyboard.press('Control+c')
await page.keyboard.press('Control+v')
check((await items()) === 5, 'Ctrl+V pastes the two copies')
check((await picked()) === 2, 'the pasted copies are selected')
const pasted = await positions()
check(Math.round(pasted[3][0] - pasted[0][0]) > 0 && Math.round(pasted[3][1] - pasted[0][1]) > 0, 'the copy sits off the original')
await page.keyboard.press('Control+v')
const again = await positions()
check(again.length === 7 && again[5][0] > pasted[3][0], 'a second paste lands further along')
await page.screenshot({ path: OUT + 's-pasted.png' })

// Ctrl+D duplicates, Delete removes all picked, Ctrl+Z brings them back.
await page.keyboard.press('Control+d')
check((await items()) === 9, 'Ctrl+D duplicates')
await page.keyboard.press('Delete')
check((await items()) === 7, 'Delete removes everything picked')
await page.keyboard.press('Control+z')
check((await items()) === 9, 'Ctrl+Z brings them back')

// Ctrl+A picks every item; Ctrl+X cuts them; Escape lets go.
await page.keyboard.press('Control+a')
check((await picked()) === 9, 'Ctrl+A picks every item')
await page.keyboard.press('Escape')
check((await picked()) === 0, 'Escape lets go')
// Copies overlap their originals; the last one is on top.
await marks.last().click()
await page.keyboard.press('Control+x')
check((await items()) === 8, 'Ctrl+X cuts')
await page.keyboard.press('Control+v')
check((await items()) === 9, 'and Ctrl+V puts it back')

// Shortcuts stay out of the way while typing.
await page.keyboard.press('Escape')
await page.locator('.item[data-type="text"] .item__body').last().dblclick()
const area = page.locator('.item textarea')
await area.waitFor()
await page.keyboard.press('Control+a')
await page.keyboard.type('hola')
check((await area.inputValue()) === 'hola', 'Ctrl+A in a text box selects its text, not the items')
await page.keyboard.press('Enter')

// Ctrl+wheel (a trackpad pinch) zooms the document, not the page.
const zoomBefore = parseInt(await page.locator('.topbar__pct').textContent())
p = await at(0.5, 0.4)
await page.mouse.move(p.x, p.y)
await page.keyboard.down('Control')
for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -40)
await page.keyboard.up('Control')
await page.waitForTimeout(400)
const zoomAfter = parseInt(await page.locator('.topbar__pct').textContent())
check(zoomAfter > zoomBefore, `Ctrl+wheel zooms the document (${zoomBefore}% to ${zoomAfter}%)`)
check((await page.evaluate(() => visualViewport.scale)) === 1, 'the browser does not zoom')

await browser.close()
console.log(log.join('\n'))
console.log(problems.length ? problems.join('\n') : 'no problems')
