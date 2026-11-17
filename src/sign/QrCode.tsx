import { useMemo } from 'react'
import { encode } from 'uqr'

// Square modules, dark on white whatever the theme: scanners read contrast,
// not style. The quiet zone is the card's padding around it.
export function QrCode({ value, label, className = '' }: { value: string; label: string; className?: string }) {
  const { size, path } = useMemo(() => {
    const qr = encode(value, { ecc: 'M', border: 0 })
    let d = ''
    qr.data.forEach((row, y) => {
      let x = 0
      while (x < row.length) {
        if (!row[x]) {
          x++
          continue
        }
        const start = x
        while (x < row.length && row[x]) x++
        d += `M${start} ${y}h${x - start}v1h${start - x}z`
      }
    })
    return { size: qr.size, path: d }
  }, [value])

  return (
    <svg className={`qr ${className}`} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <path d={path} fill="#0b1020" />
    </svg>
  )
}
