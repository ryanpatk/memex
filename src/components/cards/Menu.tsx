import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

export type MenuEntry =
  | {
      kind?: 'item';
      id: string;
      label: string;
      icon?: ReactNode;
      /** A space colour dot instead of an icon. */
      color?: string;
      shortcut?: string;
      checked?: boolean;
      danger?: boolean;
      disabled?: boolean;
      onSelect: () => void;
    }
  | { kind: 'separator'; id: string }
  | { kind: 'header'; id: string; label: string };

interface MenuProps {
  /** Renders the trigger; spread the props onto a button. */
  trigger: (props: {
    ref: (node: HTMLButtonElement | null) => void;
    onClick: () => void;
    onKeyDown: (event: ReactKeyboardEvent) => void;
    'aria-haspopup': 'menu';
    'aria-expanded': boolean;
    'aria-controls': string;
  }) => ReactNode;
  entries: MenuEntry[];
  /** Which edge of the trigger the menu lines up with. */
  align?: 'start' | 'end';
  label: string;
  /** Extra content under the items (e.g. a hint). */
  footer?: ReactNode;
}

/**
 * The ••• menu (s07), per the WAI-ARIA menu button pattern: Enter/Space/↓
 * opens on the first item, ↑ on the last; ↑/↓/Home/End move; Esc or Tab
 * closes and focus returns to the trigger; a click outside closes.
 */
const Menu = ({ trigger, entries, align = 'end', label, footer }: MenuProps) => {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const focusOnOpen = useRef<'first' | 'last'>('first');

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)') ?? []);

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const list = items();
    (focusOnOpen.current === 'last' ? list[list.length - 1] : list[0])?.focus();
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [close, open]);

  const onMenuKey = (event: ReactKeyboardEvent) => {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      list[(index + 1) % list.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      list[(index - 1 + list.length) % list.length]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      list[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      list[list.length - 1]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'Tab') {
      close(false);
    }
  };

  const onTriggerKey = (event: ReactKeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      focusOnOpen.current = event.key === 'ArrowUp' ? 'last' : 'first';
      setOpen(true);
    }
  };

  return (
    <span className="mc-anchor" style={{ display: 'inline-flex' }}>
      {trigger({
        ref: (node) => {
          triggerRef.current = node;
        },
        onClick: () => {
          focusOnOpen.current = 'first';
          setOpen((value) => !value);
        },
        onKeyDown: onTriggerKey,
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': menuId,
      })}
      <div
        ref={menuRef}
        id={menuId}
        role="menu"
        aria-label={label}
        className="mc-menu"
        hidden={!open}
        style={align === 'start' ? ({ left: 0, right: 'auto' } as CSSProperties) : undefined}
        onKeyDown={onMenuKey}
      >
        {entries.map((entry) => {
          if (entry.kind === 'separator') return <hr key={entry.id} className="mc-msep" />;
          if (entry.kind === 'header')
            return (
              <div key={entry.id} className="mc-mhd" role="presentation">
                {entry.label}
              </div>
            );
          const checkable = entry.checked !== undefined;
          return (
            <button
              key={entry.id}
              type="button"
              role={checkable ? 'menuitemcheckbox' : 'menuitem'}
              aria-checked={checkable ? entry.checked : undefined}
              tabIndex={-1}
              disabled={entry.disabled}
              className={`mc-mi${entry.danger ? ' is-danger' : ''}`}
              onClick={() => {
                close();
                entry.onSelect();
              }}
            >
              <span className="mc-mi-icon" aria-hidden="true">
                {entry.color ? <span className="mc-mi-dot" style={{ '--c': entry.color } as CSSProperties} /> : entry.icon}
              </span>
              <span>{entry.label}</span>
              {(entry.shortcut || entry.checked) && <small>{entry.checked ? '✓' : entry.shortcut}</small>}
            </button>
          );
        })}
        {footer}
      </div>
    </span>
  );
};

export default Menu;
