import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { HelmetProvider } from 'react-helmet-async';
import { AppContent } from './App.jsx';
import { InitialDataProvider } from './contexts/InitialDataContext.jsx';

export function render(url, initialData) {
  const helmetContext = {};

  const html = ReactDOMServer.renderToString(
    <React.StrictMode>
      <HelmetProvider context={helmetContext}>
        <InitialDataProvider initialData={initialData}>
          <StaticRouter location={url}>
            <AppContent />
          </StaticRouter>
        </InitialDataProvider>
      </HelmetProvider>
    </React.StrictMode>,
  );

  const { helmet } = helmetContext;

  return { html, helmet };
}
