import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { requestPersistentStorage } from './data';
import { App } from './ui/App';
import './ui/styles.css';

registerSW({ immediate: true });
void requestPersistentStorage();

const root = document.getElementById('root');
if (!root) throw new Error('Falta el elemento #root');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
