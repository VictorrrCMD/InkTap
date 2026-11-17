import { legalHref, LEGAL_LINKS } from './owner'

// Opened from the editor or the phone, the links use a new tab so the
// document or the signing session isn't lost.
export function LegalLinks({ newTab = false, className = '' }: { newTab?: boolean; className?: string }) {
  return (
    <nav className={`legal-links ${className}`} aria-label="Información legal">
      {LEGAL_LINKS.map((link) => (
        <a key={link.slug} href={legalHref(link.slug)} target={newTab ? '_blank' : undefined} rel={newTab ? 'noopener' : undefined}>
          {link.short}
        </a>
      ))}
    </nav>
  )
}
