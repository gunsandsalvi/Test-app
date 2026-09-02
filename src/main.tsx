import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Bench from './App.tsx';
import Aurora from './ui/Aurora.tsx';
import './index.css';

/** `#bench` keeps the measuring instrument reachable; everything else is Aurora. */
function Root() {
  return window.location.hash === '#bench' ? <Bench /> : <Aurora />;
}
window.addEventListener('hashchange', () => window.location.reload());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
