import React from 'react'
import { hydrateRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { AppContent } from './App.jsx'
import './index.css'
import './services/analytics' // initialize PostHog on app load

const initialData = window.__INITIAL_DATA__ || null;

hydrateRoot(
  document.getElementById('root'),
  <React.StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <AppContent initialData={initialData} />
      </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>,
)
