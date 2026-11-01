import { useCallback, useEffect, useState } from 'react';
import { CANVAS_COLOR_OPTIONS, type CanvasColorId } from '@memex/core';
import {
  applyCanvasColor,
  getStoredCanvasColorId,
  isDarkTheme,
  persistCanvasColor,
} from '../utils/canvasColor';

export function useCanvasColor() {
  const [colorId, setColorIdState] = useState<CanvasColorId>(() =>
    getStoredCanvasColorId(),
  );
  const [darkMode, setDarkMode] = useState(() => isDarkTheme());

  useEffect(() => {
    applyCanvasColor(colorId);
    persistCanvasColor(colorId);
  }, [colorId]);

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setDarkMode(isDarkTheme());
      applyCanvasColor(colorId);
    });

    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => observer.disconnect();
  }, [colorId]);

  const setColorId = useCallback((nextColorId: CanvasColorId) => {
    setColorIdState(nextColorId);
  }, []);

  return {
    colorId,
    setColorId,
    options: CANVAS_COLOR_OPTIONS,
    darkMode,
  };
}
