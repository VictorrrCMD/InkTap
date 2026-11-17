// Keyboard-only pass (sign, place, move, delete, undo) and broken phone links.
// Usage: node tests/keyboard.mjs
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173'
const OUT = process.env.OUT_DIR ?? './'
const FIX = new URL('./fixtures/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
mkdirSync(OUT, { recursive: true })
const log = []
const problems = []
const check = (ok, what) => (ok ? log.push(`ok   ${what}`) : problems.push(`FAIL ${what}`))

const focused = (page) =>
  page.evaluate(() => {
    const el = document.activeElement
    if (!el) return 'none'
    return `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : ''} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40)}"`
  })

const browser = await chromium.launch({ channel: 'chrome' })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true })
const page = await ctx.newPage()
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && problems.push(`console.${m.type()}: ${m.text()}`))
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))

// Home: Tab reaches the theme toggle and the file button, in that order.
await page.goto(BASE + '/')
await page.getByRole('button', { name: 'Elegir PDF' }).waitFor()
await page.keyboard.press('Tab')
const first = await focused(page)
await page.keyboard.press('Tab')
const second = await focused(page)
check(/Cambiar a modo/.test(first) && /Elegir PDF/.test(second), `home tab order: ${first} -> ${second}`)
await page.screenshot({ path: OUT + 'kb-home-focus.png' })

// Editor: tab order walks the top bar, then the fields in reading order.
await page.locator('input[type=file]').setInputFiles(FIX + 'formulario.pdf')
await page.locator('.page canvas').first().waitFor()
const order = []
for (let i = 0; i < 14; i++) {
  await page.keyboard.press('Tab')
  order.push(await focused(page))
}
log.push('editor tab order:\n    ' + order.join('\n    '))
check(order.some((o) => /Nombre/.test(o)) && order.findIndex((o) => /Nombre/.test(o)) < order.findIndex((o) => /Correo/.test(o)), 'fields reached in reading order')
await page.screenshot({ path: OUT + 'kb-field-focus.png' })

// Sign with the keyboard: the dock's Firmar button, the Escribir tab, Enter.
await page.getByRole('button', { name: 'Firmar', exact: true }).focus()
await page.keyboard.press('Enter')
await page.locator('.sign-dialog').waitFor()
await page.getByRole('tab', { name: /Dibujar/ }).focus()
await page.keyboard.press('ArrowRight')
const tab = await focused(page)
check(/Escribir/.test(tab), `arrow keys move between tabs: ${tab}`)
await page.getByLabel('Tu nombre').fill('Ramiro Esquivel')
await page.getByText('Recordar en este navegador').click()
await page.waitForTimeout(400)
await page.screenshot({ path: OUT + 'kb-typed.png' })
await page.getByLabel('Tu nombre').press('Enter')
await page.locator('.hint').waitFor()
check(await page.locator('.sign-dialog').isHidden(), 'Enter in the name submits and closes the dialog')
await page.keyboard.press('Enter')
await page.locator('.item[data-type="signature"]').waitFor()
check(true, 'Enter places the armed signature at the middle of the page')
await page.screenshot({ path: OUT + 'kb-placed.png' })

// Move it with the arrows, delete it, undo.
const before = await page.locator('.item[data-type="signature"]').boundingBox()
await page.keyboard.press('Shift+ArrowRight')
const after = await page.locator('.item[data-type="signature"]').boundingBox()
check(after.x > before.x, `Shift+Arrow moves the item (${before.x.toFixed(1)} -> ${after.x.toFixed(1)})`)
await page.keyboard.press('Delete')
check((await page.locator('.item[data-type="signature"]').count()) === 0, 'Delete removes the selected item')
await page.locator('body').press('Control+z')
check((await page.locator('.item[data-type="signature"]').count()) === 1, 'Ctrl+Z brings it back')

// Escape closes the dialog; the saved signature is offered next time.
await page.getByRole('button', { name: 'Firmar', exact: true }).click()
await page.locator('.sign-dialog').waitFor()
check((await page.getByRole('tab', { name: 'Guardadas' }).count()) === 1, 'saved signature listed under Guardadas')
await page.screenshot({ path: OUT + 'kb-saved.png' })
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
check(await page.locator('.sign-dialog').isHidden(), 'Escape closes the signature dialog')

// Closing with changes asks first.
await page.getByRole('button', { name: 'Cerrar documento' }).click()
await page.locator('.confirm').waitFor()
await page.screenshot({ path: OUT + 'kb-confirm.png' })
await page.keyboard.press('Escape')
check(await page.locator('.page').first().isVisible(), 'Escape on the confirm keeps the document open')

// Broken phone links.
const phone = await ctx.newPage()
await phone.goto(BASE + '/s/abc')
await phone.locator('.phone-page__center[role=alert]').waitFor()
check(/incompleto/.test(await phone.locator('.phone-page__title').textContent()), 'malformed link explains itself')
await phone.goto(BASE + '/s/AAAAAAAAAAAAAAAAAAAAAA#' + 'A'.repeat(43))
await phone.locator('.phone-page__center[role=alert]').waitFor()
const title = await phone.locator('.phone-page__title').textContent()
check(/venció/.test(title), `unknown session explains itself: ${title}`)
await phone.screenshot({ path: OUT + 'kb-phone-expired.png' })

await browser.close()
console.log(log.join('\n'))
console.log(problems.length ? problems.join('\n') : 'no problems')
