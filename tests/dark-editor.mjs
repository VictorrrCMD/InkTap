// The editor and the signature dialog in dark mode at desktop width.
import { chromium } from 'playwright-core'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173'
const OUT = process.env.OUT_DIR ?? './'
const FIX = new URL('./fixtures/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })
const problems = []
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && problems.push(m.text()))
await page.goto(BASE + '/')
await page.locator('input[type=file]').setInputFiles(FIX + 'formulario.pdf')
await page.locator('.page canvas').first().waitFor()
await page.locator('[data-field-name="cliente.nombre"]').fill('Lucía Treviño')
await page.getByRole('button', { name: 'Fecha' }).click()
await page.waitForTimeout(400)
await page.screenshot({ path: OUT + 'dark-editor.png' })
await page.keyboard.press('Escape')
await page.getByRole('button', { name: 'Firmar', exact: true }).click()
await page.waitForTimeout(600)
await page.screenshot({ path: OUT + 'dark-dialog.png' })
await browser.close()
console.log(problems.length ? problems : 'no problems')
