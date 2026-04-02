import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { HelmetProvider } from 'react-helmet-async';
import { AppContent } from './App.jsx';

export function render(url, { initialData } = {}) {
  const helmetContext = {};

  const html = ReactDOMServer.renderToString(
    <React.StrictMode>
      <HelmetProvider context={helmetContext}>
        <StaticRouter location={url}>
          <AppContent initialData={initialData} />
        </StaticRouter>
      </HelmetProvider>
    </React.StrictMode>,
  );

  const { helmet } = helmetContext;

  return { html, helmet };
}
