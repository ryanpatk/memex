import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, FolderPlus, Trash2, X } from 'lucide-react';
import type { Profile } from '@memex/core';

interface SelectionBarProps {
  count: number;
  /** Selected items the current filters hide (selection survives filtering). */
  hiddenCount: number;
  spaces: Profile[];
  spaceColors: Map<string, string>;
  onAddToSpace: (spaceId: string) => void;
  onDelete: () => void;
  onExit: () => void;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * Floating bar for multi-select: the count, Add to space (menu), Delete
 * (undoable), and exit. Sits bottom-centre above the phone nav so actions
 * are reachable on every screen size; the sidebar spaces stay a shortcut.
 */
const SelectionBar = ({
  count,
  hiddenCount,
  spaces,
  spaceColors,
  onAddToSpace,
  onDelete,
  onExit,
}: SelectionBarProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const empty = count === 0;

  // Menu: focus the first space on open, close on outside click
  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const onPointer = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [menuOpen]);

  useEffect(() => {
    if (empty) setMenuOpen(false);
  }, [empty]);

  const closeMenu = () => {
    setMenuOpen(false);
    triggerRef.current?.focus();
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      // Close the menu only; the page-level Escape (exit selection) waits
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items[items.length - 1]?.focus();
    } else if (event.key === 'Tab') {
      setMenuOpen(false);
    }
  };

  return (
    <div className="memex-selection-bar" role="toolbar" aria-label="Selection" ref={wrapRef}>
      <p className="memex-selection-count" aria-live="polite">
        {empty ? (
          <span className="memex-selection-hint">
            Click items to select
            <span className="memex-selection-hint-keys">
              {' '}
              · Shift-click for a range · {isMac ? '⌘' : 'Ctrl'}&nbsp;A for all
            </span>
          </span>
        ) : (
          <>
            <strong>{count}</strong> selected
            {hiddenCount > 0 && (
              <span className="memex-selection-hidden"> · {hiddenCount} hidden by filters</span>
            )}
          </>
        )}
      </p>

      <div className="memex-selection-actions">
        {spaces.length > 0 && (
          <div className="memex-selection-menu-wrap">
            <button
              ref={triggerRef}
              type="button"
              className="btn-secondary btn-compact memex-selection-action"
              onClick={() => setMenuOpen((open) => !open)}
              disabled={empty}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <FolderPlus aria-hidden="true" />
              <span className="memex-selection-action-label">Add to space</span>
              <ChevronDown aria-hidden="true" className="memex-selection-caret" />
            </button>
            {menuOpen && (
              <div
                ref={menuRef}
                className="memex-menu memex-selection-menu"
                role="menu"
                aria-label="Add to space"
                onKeyDown={handleMenuKeyDown}
              >
                {spaces.map((space) => (
                  <button
                    key={space.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onAddToSpace(space.id);
                      closeMenu();
                    }}
                  >
                    <span
                      className="memex-space-dot"
                      style={{ background: spaceColors.get(space.id) }}
                      aria-hidden="true"
                    />
                    <span className="memex-selection-menu-name">{space.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          className="btn-secondary btn-compact memex-selection-action is-danger"
          onClick={onDelete}
          disabled={empty}
        >
          <Trash2 aria-hidden="true" />
          <span className="memex-selection-action-label">Delete</span>
        </button>

        <span className="memex-selection-divider" aria-hidden="true" />

        <button
          type="button"
          className="memex-icon-button"
          onClick={onExit}
          aria-label="Done selecting"
          title="Done selecting (Esc)"
        >
          <X aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

export default SelectionBar;
