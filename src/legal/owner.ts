export const UPDATED = '17 de noviembre de 2026'

// Shown on every legal page and wherever people sign.
export const TOOL_NOTICE = 'InkTap es una herramienta. Quien la usa es responsable de los documentos que firma y del uso que da a cada firma.'

export const LEGAL_LINKS = [
  { slug: 'terminos', title: 'Términos y condiciones', short: 'Términos' },
  { slug: 'privacidad', title: 'Aviso de privacidad', short: 'Privacidad' },
  { slug: 'cookies', title: 'Cookies y almacenamiento', short: 'Cookies' },
  { slug: 'uso-responsable', title: 'Uso responsable de firmas', short: 'Uso responsable' },
] as const

export type LegalSlug = (typeof LEGAL_LINKS)[number]['slug']

export const legalHref = (slug: LegalSlug) => `/legal/${slug}`
