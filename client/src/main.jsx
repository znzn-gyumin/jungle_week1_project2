import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ApiLab from './devlab/ApiLab.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ApiLab />
  </StrictMode>,
)
