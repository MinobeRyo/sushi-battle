import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { LandscapeViewport } from './components/LandscapeViewport'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LandscapeViewport><App /></LandscapeViewport>
  </StrictMode>,
)
