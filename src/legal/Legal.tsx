import { useEffect } from 'react'
import { ThemeToggle } from '../app/TopBar'
import { Logo } from '../ui/Logo'
import { DOCS, missingOwner } from './docs'
import { legalHref, LEGAL_LINKS, UPDATED, type LegalSlug } from './owner'

function current(): (typeof LEGAL_LINKS)[number] {
  const slug = location.pathname.replace(/^\/legal\/?/, '').replace(/\/$/, '')
  return LEGAL_LINKS.find((l) => l.slug === slug) ?? LEGAL_LINKS[0]
}

export default function Legal() {
  const doc = current()
  const Body = DOCS[doc.slug as LegalSlug]

  useEffect(() => {
    document.title = `${doc.title} | InkTap`
    if (location.pathname !== legalHref(doc.slug)) history.replaceState(null, '', legalHref(doc.slug))
  }, [doc])

  return (
    <div className="legal">
      <header className="legal__bar">
        <a href="/" className="legal__home" aria-label="InkTap: ir al inicio">
          <Logo label={null} />
        </a>
        <ThemeToggle />
      </header>

      <div className="legal__layout">
        <nav className="legal__nav" aria-label="Documentos legales">
          {LEGAL_LINKS.map((link) => (
            <a key={link.slug} href={legalHref(link.slug)} aria-current={link.slug === doc.slug ? 'page' : undefined}>
              {link.title}
            </a>
          ))}
        </nav>

        <main className="legal__doc">
          <h1>{doc.title}</h1>
          <p className="legal__updated">Última actualización: {UPDATED}</p>
          {missingOwner.length ? (
            <p className="legal__notice" role="note">
              Faltan datos del responsable de InkTap. Los campos marcados como pendientes deben completarse antes de publicar el sitio.
            </p>
          ) : null}
          <Body />
        </main>
      </div>

      <footer className="legal__foot">
        <a href="/">Volver a InkTap</a>
      </footer>
    </div>
  )
}
