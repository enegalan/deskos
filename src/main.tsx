/**
 * Application entry: mount App into `#root` and initialize keyboard shortcuts.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import '@core/keyboard-shortcuts'; // Initialize keyboard shortcuts

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
