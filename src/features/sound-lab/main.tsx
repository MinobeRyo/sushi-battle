import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import SoundLab from './SoundLab'

createRoot(document.getElementById('root')!).render(<StrictMode><SoundLab /></StrictMode>)
