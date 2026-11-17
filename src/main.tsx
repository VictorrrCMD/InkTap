import '@fontsource-variable/schibsted-grotesk'
import './styles/app.css'
import './styles/editor.css'
import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'

// The phone only needs the signing pad, not pdf.js: each route loads its own
// chunk.
const path = location.pathname
const Root = lazy(() => (path.startsWith('/s/') ? import('./phone/PhoneSign') : path.startsWith('/legal') ? import('./legal/Legal') : import('./app/App')))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>
      <Root />
    </Suspense>
  </StrictMode>,
)
