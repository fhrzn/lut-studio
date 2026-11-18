import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = document.getElementById('root')!;

if (new URLSearchParams(window.location.search).get('dev') === 'engine') {
  // Test page for the WebGL engine (Playwright); kept out of the main bundle.
  void import('@/engine/devHarness').then(({ mountEngineHarness }) => mountEngineHarness(root));
} else {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
