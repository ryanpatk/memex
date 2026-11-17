import React from 'react';
import ReactDOM from 'react-dom/client';
import { bind } from 'cuelume';
import '@fontsource-variable/inter';
import '@fontsource-variable/inter/wght-italic.css';
import '@fontsource/nunito/latin-900.css';
import './index.css';
import './styles/components.css';
import './styles/stream.css';
import './styles/library.css';
import router from './router';
// Memory Cards (design/memory-cards): after the base styles and the pages'
// own, so its rules win the cascade
import './styles/cards';
import { repositoryConfigError } from './data/repository';
import MissingEnv from './components/MissingEnv';
import { RouterProvider } from 'react-router-dom';
import { initCanvasColor } from './utils/canvasColor';
import { initSound } from './utils/sound';
import { installChunkReloadHandler } from './utils/chunkReload';
import { initCardsFont } from './utils/cardsFont';
import { forgetRetiredSettings } from './utils/retiredSettings';

// First, so a stale tab after a deploy reloads instead of going blank
installChunkReloadHandler();

forgetRetiredSettings();
initCanvasColor();
initSound();
bind();
initCardsFont();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {repositoryConfigError ? <MissingEnv missing={repositoryConfigError.missing} /> : <RouterProvider router={router} />}
  </React.StrictMode>,
);
