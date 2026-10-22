import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { engine } from './audio/engine';
import { useLevel } from './stores/level';
import { usePlayer } from './stores/player';
import { usePractice } from './stores/practice';
import { useProfiles } from './stores/profiles';
import { useSettings } from './stores/settings';
import './styles.css';

if (import.meta.env.DEV) {
  // Handy for poking at the app from the devtools console during development.
  Object.assign(window, { __adofai: { engine, useLevel, usePlayer, usePractice, useProfiles, useSettings } });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
