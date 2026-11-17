// One continuous signature stroke in a 300 x 112 box. The finger follows it by
// arc length, so the tip of the ink stays under the finger.

export const SIG_W = 300
export const SIG_H = 112

type P = [number, number]

function loops(x0: number, base: number, step: number, reach: number, heights: number[]): P[] {
  const out: P[] = []
  const end = heights.length * Math.PI * 2
  for (let t = 0; t <= end + 1e-6; t += 0.3) {
    const h = heights[Math.min(Math.floor(t / (Math.PI * 2)), heights.length - 1)]
    out.push([x0 + step * t + reach * Math.sin(t), base - (h * (1 - Math.cos(t))) / 2])
  }
  return out
}

const KNOTS: P[] = [
  [14, 78],
  [22, 52],
  [34, 24],
  [46, 10],
  [53, 18],
  [47, 44],
  [38, 72],
  [35, 88],
  [45, 94],
  [58, 86],
  [66, 80],
  ...loops(70, 82, 3.05, 7.5, [17, 22, 46, 16, 21]).slice(1),
  [176, 74],
  [189, 56],
  [197, 49],
  [199, 60],
  [193, 80],
  [201, 87],
  [222, 76],
  [249, 62],
  [276, 58],
  [289, 65],
  [281, 81],
  [246, 96],
  [190, 103],
  [122, 102],
  [66, 98],
  [36, 94],
]

const f = (n: number) => Math.round(n * 10) / 10

// Catmull-Rom through the knots, written as cubic Beziers.
const SEGMENTS: [P, P, P, P][] = []
for (let i = 0; i < KNOTS.length - 1; i++) {
  const p0 = KNOTS[i - 1] ?? KNOTS[i]
  const p1 = KNOTS[i]
  const p2 = KNOTS[i + 1]
  const p3 = KNOTS[i + 2] ?? p2
  const c1: P = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
  const c2: P = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
  SEGMENTS.push([p1, c1, c2, p2])
}

export const SIG_PATH =
  `M${f(KNOTS[0][0])} ${f(KNOTS[0][1])}` +
  SEGMENTS.map(([, c1, c2, p]) => `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p[0])} ${f(p[1])}`).join('')

// Dense samples with their running length, for arc-length lookups.
const SAMPLES: P[] = []
for (const [a, b, c, d] of SEGMENTS) {
  for (let k = SAMPLES.length ? 1 : 0; k <= 10; k++) {
    const t = k / 10
    const u = 1 - t
    SAMPLES.push([
      u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
      u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1],
    ])
  }
}
const RUNNING: number[] = [0]
for (let i = 1; i < SAMPLES.length; i++) {
  RUNNING.push(RUNNING[i - 1] + Math.hypot(SAMPLES[i][0] - SAMPLES[i - 1][0], SAMPLES[i][1] - SAMPLES[i - 1][1]))
}
const TOTAL = RUNNING[RUNNING.length - 1]

/** The point at fraction `u` (0..1) of the stroke's length, in the 300 x 112 box. */
export function sigPointAt(u: number): { x: number; y: number } {
  const target = Math.min(Math.max(u, 0), 1) * TOTAL
  let lo = 0
  let hi = RUNNING.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (RUNNING[mid] < target) lo = mid
    else hi = mid
  }
  const span = RUNNING[hi] - RUNNING[lo] || 1
  const k = (target - RUNNING[lo]) / span
  return { x: SAMPLES[lo][0] + (SAMPLES[hi][0] - SAMPLES[lo][0]) * k, y: SAMPLES[lo][1] + (SAMPLES[hi][1] - SAMPLES[lo][1]) * k }
}
