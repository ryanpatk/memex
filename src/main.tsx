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
import { RouterProvider } from 'react-router-dom';
import { initCanvasColor } from './utils/canvasColor';
import { initSound } from './utils/sound';
import { initLinkCaptions } from './utils/linkCaptions';
import { installChunkReloadHandler } from './utils/chunkReload';

// First, so a stale tab after a deploy reloads instead of going blank
installChunkReloadHandler();

initCanvasColor();
initLinkCaptions();
initSound();
bind();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
