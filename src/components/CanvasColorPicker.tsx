import type { CSSProperties } from 'react';
import { useCanvasColor } from '../hooks/useCanvasColor';
import { buildCanvasGradient } from '@memex/core';

const CanvasColorPicker = () => {
  const { colorId, setColorId, options, darkMode } = useCanvasColor();

  return (
    <div className="canvas-color-picker">
      <p className="bookmark-account-menu-kicker">Background</p>
      <div
        className="canvas-color-picker-grid"
        role="radiogroup"
        aria-label="App background color"
      >
        {options.map((option) => {
          const isSelected = colorId === option.id;

          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={option.label}
              title={option.label}
              className={`canvas-color-swatch${isSelected ? ' is-selected' : ''}`}
              style={
                {
                  '--swatch-color': buildCanvasGradient(
                    darkMode ? option.dark : option.light,
                    darkMode,
                  ),
                } as CSSProperties
              }
              onClick={() => setColorId(option.id)}
            />
          );
        })}
      </div>
    </div>
  );
};

export default CanvasColorPicker;
