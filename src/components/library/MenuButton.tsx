import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { Check } from 'lucide-react';

export type MenuEntry =
  | {
      key: string;
      label: ReactNode;
      /** checkbox: stays open, many can be on · radio: one is on, closes · action: closes */
      role?: 'checkbox' | 'radio' | 'action';
      checked?: boolean;
      icon?: ReactNode;
      danger?: boolean;
      disabled?: boolean;
      onSelect: () => void;
    }
  | { key: string; divider: true }
  | { key: string; heading: ReactNode };

interface MenuButtonProps {
  /** The trigger's contents. */
  children: ReactNode;
  triggerClassName: string;
  /** Accessible name for the trigger when its contents aren't enough. */
  triggerLabel?: string;
  title?: string;
  menuLabel: string;
  entries: MenuEntry[];
  align?: 'start' | 'end';
  /** Extra class on the menu (width, placement). */
  menuClassName?: string;
  /**
   * Place the menu against the viewport instead of the trigger's box, for
   * triggers inside a scrolling row that would clip it. Closes on scroll.
   */
  fixed?: boolean;
}

/**
 * A trigger that opens a `.memex-menu`: checkable filter options, a radio
 * sort list, or plain actions. APG menu button: Enter/Space/↓ open on the
 * first item, ↑/↓/Home/End move, Esc closes and returns focus, Tab leaves.
 */
const MenuButton = ({
  children,
  triggerClassName,
  triggerLabel,
  title,
  menuLabel,
  entries,
  align = 'start',
  menuClassName = '',
  fixed = false,
}: MenuButtonProps) => {
  const [open, setOpen] = useState(false);
  const [fixedStyle, setFixedStyle] = useState<CSSProperties | undefined>();
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const focusLast = useRef(false);
  const menuId = useId();

  const items = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ?? []);

  useLayoutEffect(() => {
    if (!open || !fixed) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    // The menu is in the DOM (hidden) by now: measure it and keep it on screen
    const width = menuRef.current?.offsetWidth ?? 0;
    const margin = 8;
    const preferred = align === 'end' ? rect.right - width : rect.left;
    setFixedStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left: Math.max(margin, Math.min(preferred, window.innerWidth - width - margin)),
      right: 'auto',
    });
    const dismiss = () => setOpen(false);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [align, fixed, open]);

  useEffect(() => {
    if (!open) return;
    const list = items();
    const checked = list.find((item) => item.getAttribute('aria-checked') === 'true');
    (focusLast.current ? list[list.length - 1] : (checked ?? list[0]))?.focus();
    focusLast.current = false;
    const onPointer = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      focusLast.current = event.key === 'ArrowUp';
      setOpen(true);
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    const move = (next: number) => {
      event.preventDefault();
      list[(next + list.length) % list.length]?.focus();
    };
    if (event.key === 'Escape') {
      // Close the menu only; page-level Escape (leave selection) waits
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'ArrowDown') move(index + 1);
    else if (event.key === 'ArrowUp') move(index - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(list.length - 1);
    else if (event.key === 'Tab') setOpen(false);
  };

  return (
    <div className="memex-popover-anchor memex-menu-button" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={triggerLabel}
        title={title}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onTriggerKeyDown}
      >
        {children}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={menuLabel}
          className={`memex-menu memex-menu--${align} ${menuClassName}`}
          style={fixed ? (fixedStyle ?? { visibility: 'hidden' }) : undefined}
          onKeyDown={onMenuKeyDown}
        >
          {entries.map((entry) => {
            if ('divider' in entry) return <hr key={entry.key} className="memex-menu-divider" />;
            if ('heading' in entry) {
              return (
                <p key={entry.key} className="memex-menu-heading" role="presentation">
                  {entry.heading}
                </p>
              );
            }
            const role = entry.role ?? 'action';
            const checkable = role !== 'action';
            return (
              <button
                key={entry.key}
                type="button"
                role={checkable ? `menuitem${role}` : 'menuitem'}
                aria-checked={checkable ? Boolean(entry.checked) : undefined}
                disabled={entry.disabled}
                className={`${entry.danger ? 'is-danger' : ''}${checkable ? ' is-checkable' : ''}`}
                onClick={() => {
                  entry.onSelect();
                  if (role !== 'checkbox') close();
                }}
              >
                {checkable && (
                  <span className={`memex-menu-check${entry.checked ? ' is-on' : ''}`} aria-hidden="true">
                    {entry.checked && <Check />}
                  </span>
                )}
                {entry.icon}
                <span className="memex-menu-label">{entry.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MenuButton;
