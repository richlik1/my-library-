// Safari can't `for await` over streams (used by PDF.js and the voice model loaders).
import './core/importers/streamPolyfill';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles.css';
import './ui/audioSession';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
