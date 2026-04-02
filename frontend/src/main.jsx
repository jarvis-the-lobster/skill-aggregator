import React from 'react'
import { hydrateRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { AppContent } from './App.jsx'
import { InitialDataProvider } from './contexts/InitialDataContext.jsx'
import './index.css'
import './services/analytics' // initialize PostHog on app load

const initialData = typeof window !== 'undefined' && window.__INITIAL_PLAN__
  ? { plan: window.__INITIAL_PLAN__, planSkillId: window.__INITIAL_PLAN_SKILL_ID__ }
  : {}

hydrateRoot(
  document.getElementById('root'),
  <React.StrictMode>
    <HelmetProvider>
      <InitialDataProvider initialData={initialData}>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </InitialDataProvider>
    </HelmetProvider>
  </React.StrictMode>,
)
