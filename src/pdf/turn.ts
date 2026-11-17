// Items turn around their own center, clockwise as seen on screen (y points down).

export const normalizeAngle = (deg: number) => ((Math.round(deg) % 360) + 360) % 360

export function turnPoint(px: number, py: number, cx: number, cy: number, deg: number): [number, number] {
  if (!deg) return [px, py]
  const r = (deg * Math.PI) / 180
  const dx = px - cx
  const dy = py - cy
  return [cx + dx * Math.cos(r) - dy * Math.sin(r), cy + dx * Math.sin(r) + dy * Math.cos(r)]
}

// The upright box that holds a w by h box turned by deg.
export function turnedSize(w: number, h: number, deg: number) {
  const r = (deg * Math.PI) / 180
  const c = Math.abs(Math.cos(r))
  const s = Math.abs(Math.sin(r))
  return { w: w * c + h * s, h: w * s + h * c }
}
