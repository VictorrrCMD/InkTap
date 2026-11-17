// Screenshots of the home page at the widths and themes it ships in.
// Usage: OUT_DIR=... node tests/shots.mjs
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173'
const OUT = process.env.OUT_DIR ?? './'
mkdirSync(OUT, { recursive: true })
const problems = []

const browser = await chromium.launch({ channel: 'chrome' })
const runs = [
  { name: 'home-1440-light', viewport: { width: 1440, height: 900 }, colorScheme: 'light' },
  { name: 'home-1440-dark', viewport: { width: 1440, height: 900 }, colorScheme: 'dark' },
  { name: 'home-1024-light', viewport: { width: 1024, height: 768 }, colorScheme: 'light' },
  { name: 'home-390-light', viewport: { width: 390, height: 844 }, colorScheme: 'light', isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
]
for (const run of runs) {
  const ctx = await browser.newContext({ viewport: run.viewport, colorScheme: run.colorScheme, isMobile: run.isMobile, hasTouch: run.hasTouch, deviceScaleFactor: run.deviceScaleFactor ?? 1 })
  const page = await ctx.newPage()
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && problems.push(`[${run.name}] ${m.type()}: ${m.text()}`))
  page.on('pageerror', (e) => problems.push(`[${run.name}] pageerror: ${e.message}`))
  await page.goto(BASE + '/')
  await page.locator('.esd .ss-stage').first().waitFor()
  await page.waitForTimeout(Number(process.env.WAIT ?? 6800))
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (overflow > 0) problems.push(`[${run.name}] horizontal overflow ${overflow}px`)
  await page.screenshot({ path: `${OUT}${run.name}.png`, fullPage: true })
  await ctx.close()
}
await browser.close()
console.log(JSON.stringify(problems, null, 1))
