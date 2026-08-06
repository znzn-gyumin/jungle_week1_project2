import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import DevLabRoot from './devlab/Root.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DevLabRoot app={<App />} />
  </StrictMode>,
)
