import { useEffect } from 'react'
import { createStore, useStore } from './store'

export type Theme = 'light' | 'dark'

const KEY = 'inktap:theme'
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

function stored(): Theme | null {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

// One theme for the whole page: the toggle and anything drawn to match it
// (the home page's demo) read the same value.
const themeStore = createStore<{ theme: Theme }>({ theme: stored() ?? (media().matches ? 'dark' : 'light') })

let following = false
function followSystem() {
  if (following) return
  following = true
  media().addEventListener('change', (e) => {
    if (!stored()) themeStore.set({ theme: e.matches ? 'dark' : 'light' })
  })
}

export function useTheme(): [Theme, () => void] {
  useEffect(followSystem, [])
  const theme = useStore(themeStore, (s) => s.theme)

  const toggle = () => {
    const next: Theme = themeStore.get().theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // Private windows can refuse storage; the theme still applies for this visit.
    }
    themeStore.set({ theme: next })
  }

  return [theme, toggle]
}
