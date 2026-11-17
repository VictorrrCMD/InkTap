import { LINE_HEIGHT } from './place'

// Helvetica and Arial share widths but not where the baseline sits in the line
// box, so measure it once from the font this browser renders with.
let baseline: number | null = null

export function docBaseline(): number {
  if (baseline !== null) return baseline
  const box = document.createElement('div')
  box.className = 'doc-font'
  box.style.cssText = `position:absolute;left:-9999px;top:0;visibility:hidden;font-size:100px;line-height:${LINE_HEIGHT};white-space:nowrap`
  const marker = document.createElement('span')
  marker.style.cssText = 'display:inline-block;width:1px;height:0;vertical-align:baseline'
  box.append('Hg', marker)
  document.body.append(box)
  const ratio = (marker.getBoundingClientRect().top - box.getBoundingClientRect().top) / 100
  box.remove()
  baseline = ratio > 0.6 && ratio < 1.15 ? ratio : 0.95
  return baseline
}
