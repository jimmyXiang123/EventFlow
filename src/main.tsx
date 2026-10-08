import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@xyflow/react/dist/style.css'
import './styles.css'
import { App } from './App'
import { useStore } from './state/projectStore'

/**
 * Expose the store during development so the running app can be inspected and
 * driven from the console (or an automated check):
 *
 *   __EF.getState().setGuidanceOverride('novice')
 *   __EF.getState().projects.length
 *
 * Deliberately excluded from production builds.
 */
if (import.meta.env.DEV) {
  ;(window as unknown as { __EF: typeof useStore }).__EF = useStore
}

/**
 * Decide the landing view from whatever is already persisted, so the app does
 * not force a detour through the dashboard when a project is already selected.
 * (The inline bootstrap in index.html computes that hint before the bundle runs.)
 */
const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root is missing from index.html')

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
