import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // Caminho relativo: funciona no GitHub Pages (/nome-do-repo/) e na ponte (/).
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(console.error));
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
