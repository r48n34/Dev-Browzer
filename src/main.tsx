import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@mantine/core/styles.css';
import './styles.css';
import { App } from './App';
import { DevBrowzerProvider } from './state/DevBrowzerProvider';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DevBrowzerProvider>
      <App />
    </DevBrowzerProvider>
  </StrictMode>,
);
