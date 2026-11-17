import '@fontsource-variable/schibsted-grotesk'
import './styles/app.css'
import './styles/editor.css'
import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'

// The phone only needs the signing pad, not pdf.js: each route loads its own
// chunk.
const isPhone = location.pathname.startsWith('/s/')
const Root = lazy(() => (isPhone ? import('./phone/PhoneSign') : import('./app/App')))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>
      <Root />
    </Suspense>
  </StrictMode>,
)
