// Prints what pdf.js reports for each field of a fixture, through the app's
// own openPdf. Usage: node tests/probe-fields.mjs formulario.pdf
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const name = process.argv[2] ?? 'formulario.pdf'
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage()
await page.goto(process.env.BASE_URL ?? 'http://127.0.0.1:5173/')
const bytes = [...readFileSync(new URL(`./fixtures/${name}`, import.meta.url))]
const out = await page.evaluate(async ({ data, raw }) => {
  const { openPdf } = await import('/src/pdf/open.ts')
  const opened = await openPdf(new Uint8Array(data))
  if (raw) {
    const p = await opened.pdf.getPage(1)
    const annots = await p.getAnnotations({ intent: 'display' })
    return annots.map((a) => {
      const copy = {}
      for (const [k, v] of Object.entries(a)) copy[k] = typeof v === 'object' && v !== null ? JSON.stringify(v).slice(0, 120) : v
      return copy
    })
  }
  return opened.fields.map((f) => ({ name: f.name, kind: f.kind, fontSize: f.fontSize, rect: f.rect, multiline: f.multiline, onValue: f.onValue, border: f.border, bg: f.background }))
}, { data: bytes, raw: process.argv[3] === 'raw' })
console.log(JSON.stringify(out, null, 1))
await browser.close()
