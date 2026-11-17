import type { Signature } from '../pdf/model'

// Draws a signature at whatever size its box has: ink as vector paths, a typed
// one as its image.
export function SignatureArt({ signature, className = '' }: { signature: Signature; className?: string }) {
  if (signature.kind === 'image' && signature.src) {
    return <img src={signature.src} alt="" className={`sig-art ${className}`} draggable={false} />
  }
  return (
    <svg className={`sig-art ${className}`} viewBox={`0 0 ${signature.w} ${signature.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
      <g fill={signature.color}>
        {signature.paths?.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  )
}
