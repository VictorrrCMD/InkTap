// Who answers for InkTap in the legal pages. Fill these in before publishing:
// while one is empty, the pages show it as pending instead of inventing it.
export const OWNER = {
  // Full name of the person, or the company's legal name (razón social).
  name: '',
  // Address for legal notices (domicilio para oír y recibir notificaciones).
  address: '',
  // Contact for privacy requests and reports of misuse.
  email: '',
  // City whose courts settle disputes, e.g. "Ciudad de México".
  city: '',
}

export const UPDATED = '17 de noviembre de 2026'

export const LEGAL_LINKS = [
  { slug: 'terminos', title: 'Términos y condiciones', short: 'Términos' },
  { slug: 'privacidad', title: 'Aviso de privacidad', short: 'Privacidad' },
  { slug: 'cookies', title: 'Cookies y almacenamiento', short: 'Cookies' },
  { slug: 'uso-responsable', title: 'Uso responsable de firmas', short: 'Uso responsable' },
] as const

export type LegalSlug = (typeof LEGAL_LINKS)[number]['slug']

export const legalHref = (slug: LegalSlug) => `/legal/${slug}`
