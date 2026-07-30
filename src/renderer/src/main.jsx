import React from 'react'
import { createRoot } from 'react-dom/client'

// Astryx: reset + compiled component styles + the neutral theme tokens.
// The theme activates via data-astryx-theme="neutral" on <html> (see index.html).
import '@astryxdesign/core/reset.css'
import '@astryxdesign/core/astryx.css'
import '@astryxdesign/theme-neutral/theme.css'
import './app.css'

import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
