import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { ProveedorAutenticacion } from './auth/AuthProvider'
import './index.css'
import Aplicacion from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <ProveedorAutenticacion><Aplicacion /></ProveedorAutenticacion>
    </HashRouter>
  </StrictMode>,
)
