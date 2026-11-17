// Legal pages, the links that lead to them, and the logo as the way home.
// Usage: node tests/legal.mjs
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173'
const OUT = process.env.OUT_DIR ?? './'
const FIX = new URL('./fixtures/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
mkdirSync(OUT, { recursive: true })
const TOOL = 'InkTap es una herramienta. Quien la usa es responsable'
const problems = []
const log = []
const check = (ok, label) => {
  log.push(`${ok ? 'ok  ' : 'FAIL'} ${label}`)
  if (!ok) problems.push(label)
}

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } })
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`))
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))

const pages = [
  ['terminos', 'Términos y condiciones'],
  ['privacidad', 'Aviso de privacidad'],
  ['cookies', 'Cookies y almacenamiento'],
  ['uso-responsable', 'Uso responsable de firmas'],
]
for (const [slug, title] of pages) {
  await page.goto(`${BASE}/legal/${slug}`)
  await page.locator('.legal__doc h1').waitFor()
  check((await page.locator('.legal__doc h1').textContent()) === title, `${slug}: title`)
  check((await page.title()) === `${title} | InkTap`, `${slug}: document title`)
  check((await page.locator(`.legal__nav a[aria-current="page"]`).textContent()) === title, `${slug}: nav marks the page`)
  const text = await page.locator('.legal__doc').innerText()
  check(!/[—–]/.test(text), `${slug}: no long dashes`)
  check(text.includes(TOOL) && !/Pendiente/i.test(text), `${slug}: tool notice, nothing pending`)
  await page.screenshot({ path: `${OUT}legal-${slug}.png`, fullPage: true })
}
await page.goto(`${BASE}/legal`)
await page.locator('.legal__doc h1').waitFor()
check(new URL(page.url()).pathname === '/legal/terminos', '/legal opens the terms')
await page.locator('.legal__home').click()
await page.locator('.home__intro').waitFor()
check(new URL(page.url()).pathname === '/', 'logo on a legal page goes home')

// Home: the privacy promise and the footer links.
check(await page.getByText('Todo se queda en tu equipo').isVisible(), 'home shows the privacy promise')
const footLinks = await page.locator('.home__foot .legal-links a').allTextContents()
check(footLinks.join(',') === 'Términos,Privacidad,Cookies,Uso responsable', `home footer links: ${footLinks.join(', ')}`)
check((await page.locator('.home__foot').innerText()).includes(TOOL), 'home footer carries the tool notice')
await page.screenshot({ path: OUT + 'legal-home.png' })

// Editor: the logo goes home, through the confirm when there is unsaved work.
await page.locator('input[type=file]').setInputFiles(FIX + 'formulario.pdf')
await page.locator('.page canvas').first().waitFor()
await page.getByRole('button', { name: 'Firmar', exact: true }).click()
check((await page.locator('.sign__notice').innerText()).includes(TOOL), 'sign dialog carries the tool notice')
await page.screenshot({ path: OUT + 'legal-dialog.png' })
await page.keyboard.press('Escape')
await page.getByRole('button', { name: 'Ir al inicio' }).click()
await page.locator('.home__intro').waitFor()
check(true, 'editor logo goes home when nothing changed')
await page.locator('input[type=file]').setInputFiles(FIX + 'formulario.pdf')
await page.locator('.page canvas').first().waitFor()
await page.locator('.pdf-field--text').first().fill('Cambio')
await page.getByRole('button', { name: 'Ir al inicio' }).click()
check(await page.getByRole('button', { name: 'Cerrar sin descargar' }).isVisible(), 'unsaved work asks before leaving')
await page.screenshot({ path: OUT + 'legal-confirm.png' })

// Narrow editor: the logo shrinks to its symbol and still goes home.
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await phone.goto(BASE + '/')
await phone.locator('input[type=file]').setInputFiles(FIX + 'formulario.pdf')
await phone.locator('.page canvas').first().waitFor()
check(await phone.locator('.topbar__logo-mark').isVisible(), 'phone editor shows the symbol')
check(!(await phone.locator('.topbar__logo').isVisible()), 'phone editor hides the full logo')
await phone.screenshot({ path: OUT + 'legal-phone-editor.png', clip: { x: 0, y: 0, width: 390, height: 120 } })
await phone.goto(BASE + '/s/AAAAAAAAAAAAAAAAAAAAAA#' + 'A'.repeat(43))
await phone.locator('.phone-page__foot').waitFor()
check((await phone.locator('.phone-page__foot').innerText()).includes(TOOL), 'phone page carries the tool notice')
await phone.goto(BASE + '/legal/privacidad')
await phone.locator('.legal__doc h1').waitFor()
const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
check(overflow <= 0, `legal page fits a phone (overflow ${overflow}px)`)
await phone.screenshot({ path: OUT + 'legal-phone.png' })

await browser.close()
console.log(log.join('\n'))
console.log(problems.length ? problems.join('\n') : 'no problems')
