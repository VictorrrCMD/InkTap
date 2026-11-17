// A 120-page PDF: time to first page, a scroll to the end, and the download.
import { chromium } from 'playwright-core'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173'
const FIX = new URL('./fixtures/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
const problems = []
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && problems.push(m.text()))
await page.goto(BASE + '/')
await page.getByRole('button', { name: 'Elegir PDF' }).waitFor()
const t0 = Date.now()
await page.locator('input[type=file]').setInputFiles(FIX + 'largo-120.pdf')
await page.locator('.page canvas').first().waitFor()
const firstPage = Date.now() - t0
const pages = await page.locator('.page').count()
const canvasesAtStart = await page.locator('.page canvas').count()
const t1 = Date.now()
await page.evaluate(() => { const v = document.querySelector('.viewport'); v.scrollTop = v.scrollHeight })
await page.locator('.page').last().locator('canvas').waitFor({ timeout: 20000 })
const lastPage = Date.now() - t1
await page.locator('[data-field-name="anexo120.nombre"]').fill('Final')
const t2 = Date.now()
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Descargar/ }).click()])
await dl.path()
const exportMs = Date.now() - t2
console.log(JSON.stringify({ pages, firstPageMs: firstPage, canvasesAtStart, scrollToLastMs: lastPage, exportMs, problems }, null, 1))
await browser.close()
