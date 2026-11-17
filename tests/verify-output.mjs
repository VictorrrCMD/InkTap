// Opens exported PDFs with the app's own pdf.js, prints their text and form
// state, and renders each page to PNG. Usage: node tests/verify-output.mjs out.pdf [...]
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { chromium } from 'playwright-core'

const files = process.argv.slice(2)
const OUT = process.env.OUT_DIR ?? './'
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1000, height: 1300 } })
await page.goto(process.env.BASE_URL ?? 'http://127.0.0.1:5173/')

for (const file of files) {
  const bytes = [...readFileSync(file)]
  const info = await page.evaluate(async (data) => {
    const { openPdf } = await import('/src/pdf/open.ts')
    const opened = await openPdf(new Uint8Array(data))
    const pages = []
    document.body.innerHTML = ''
    document.body.style.background = '#888'
    for (let i = 1; i <= opened.pdf.numPages; i++) {
      const p = await opened.pdf.getPage(i)
      const text = (await p.getTextContent()).items.map((it) => it.str).join(' ').replace(/\s+/g, ' ')
      const viewport = p.getViewport({ scale: 1.5 })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      canvas.id = `p${i}`
      canvas.style.display = 'block'
      canvas.style.margin = '8px'
      document.body.append(canvas)
      await p.render({ canvas, viewport }).promise
      pages.push({ text: text.slice(0, 400), size: [Math.round(viewport.width), Math.round(viewport.height)] })
    }
    return { pages, fields: opened.fields.map((f) => `${f.kind}:${f.name}`), values: opened.initial }
  }, bytes)
  for (let i = 1; i <= info.pages.length; i++) {
    await page.locator(`#p${i}`).screenshot({ path: `${OUT}${basename(file, '.pdf')}-p${i}.png` })
  }
  console.log(basename(file), JSON.stringify(info, null, 1))
}
await browser.close()
