import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { MoreHorizontal, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { normalizeViewName, VIEW_NAME_MAX, type LibraryView } from '@memex/core';
import MenuButton from './MenuButton';

export interface ViewTab {
  view: LibraryView;
  count: number;
  /** The view as a URL: its filters, plus its sort and layout when it has them. */
  href: string;
}

interface LibraryViewTabsProps {
  tabs: ViewTab[];
  activeId: string | null;
  /** Side effects of opening a tab (navigation itself is the link). */
  onOpen: (view: LibraryView) => void;
  /** The filters match no tab, so they can be saved. */
  canSave: boolean;
  suggestedName: string;
  onSave: (name: string) => Promise<unknown>;
  /** The open saved view's layout or sort differs from what it stores. */
  canUpdate: boolean;
  onUpdate: (view: LibraryView) => void;
  onRename: (view: LibraryView, name: string) => void;
  onDelete: (view: LibraryView) => void;
}

const numberFormat = new Intl.NumberFormat();

/** The inline name field for Save view and Rename: Enter saves, Esc or leaving cancels. */
const ViewNameField = ({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: string;
  submitLabel: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) => {
  const [value, setValue] = useState(initial);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const name = normalizeViewName(value);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name) onSubmit(name);
    else inputRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  };

  return (
    <form
      ref={formRef}
      className="memex-view-name-form"
      onSubmit={submit}
      onBlur={(event) => {
        if (!formRef.current?.contains(event.relatedTarget as Node | null)) onCancel();
      }}
    >
      <input
        ref={inputRef}
        className="input-field memex-view-name-input"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        maxLength={VIEW_NAME_MAX + 20}
        aria-label="View name"
        placeholder="View name…"
        autoComplete="off"
        spellCheck={false}
        name="view-name"
      />
      <button type="submit" className="btn-primary btn-compact memex-view-name-submit" disabled={!name}>
        {submitLabel}
      </button>
    </form>
  );
};

/**
 * Saved views as tabs over the Library (decision 15A): built-ins, then
 * yours, then Save view when the filters match none of them. Each tab is a
 * link to its view, so it deep-links and opens in a new tab with ⌘-click.
 */
const LibraryViewTabs = ({
  tabs,
  activeId,
  onOpen,
  canSave,
  suggestedName,
  onSave,
  canUpdate,
  onUpdate,
  onRename,
  onDelete,
}: LibraryViewTabsProps) => {
  const [naming, setNaming] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);

  // Keep the lit tab in view when the row scrolls sideways
  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('.memex-view-tab.is-active');
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeId]);

  useEffect(() => {
    if (!canSave) setNaming(false);
  }, [canSave]);

  // Fade whichever edge has more tabs past it
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const update = () => {
      const max = list.scrollWidth - list.clientWidth;
      list.dataset.fadeStart = String(list.scrollLeft > 1);
      list.dataset.fadeEnd = String(max - list.scrollLeft > 1);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(list);
    list.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      list.removeEventListener('scroll', update);
    };
  }, [tabs.length, naming, renamingId]);

  const handleOpen = (event: MouseEvent<HTMLAnchorElement>, view: LibraryView) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    onOpen(view);
  };

  const handleSave = async (name: string) => {
    setSavePending(true);
    try {
      await onSave(name);
      setNaming(false);
    } catch {
      // The page said why; the field stays open with the name so Save can try again
    } finally {
      setSavePending(false);
    }
  };

  return (
    <nav className="memex-view-tabs" aria-label="Saved views">
      <ul ref={listRef} className="memex-view-tabs-list">
        {tabs.map(({ view, count, href }) => {
          const active = view.id === activeId;
          if (renamingId === view.id) {
            return (
              <li key={view.id} className="memex-view-tab is-active is-editing">
                <ViewNameField
                  initial={view.name}
                  submitLabel="Rename"
                  onSubmit={(name) => {
                    setRenamingId(null);
                    if (name !== view.name) onRename(view, name);
                  }}
                  onCancel={() => setRenamingId(null)}
                />
              </li>
            );
          }
          return (
            <li key={view.id} className={`memex-view-tab${active ? ' is-active' : ''}${view.builtIn ? '' : ' is-saved'}`}>
              <Link
                to={href}
                className="memex-view-tab-link"
                aria-current={active ? 'page' : undefined}
                onClick={(event) => handleOpen(event, view)}
                draggable={false}
              >
                <span className="memex-view-tab-label">{view.name}</span>
                <span className="memex-view-tab-count" aria-label={`${count} items`}>
                  {numberFormat.format(count)}
                </span>
              </Link>
              {active && !view.builtIn && (
                <MenuButton
                  triggerClassName="memex-icon-button is-compact memex-view-tab-menu"
                  triggerLabel={`Options for ${view.name}`}
                  title="View options"
                  menuLabel={`${view.name} options`}
                  menuClassName="memex-view-tab-menu-list"
                  fixed
                  entries={[
                    {
                      key: 'rename',
                      label: 'Rename…',
                      icon: <Pencil aria-hidden="true" />,
                      onSelect: () => setRenamingId(view.id),
                    },
                    ...(canUpdate
                      ? [
                          {
                            key: 'update',
                            label: 'Save layout and sort to this view',
                            icon: <RefreshCw aria-hidden="true" />,
                            onSelect: () => onUpdate(view),
                          },
                        ]
                      : []),
                    { key: 'divider', divider: true as const },
                    {
                      key: 'delete',
                      label: 'Delete view',
                      icon: <Trash2 aria-hidden="true" />,
                      danger: true,
                      onSelect: () => onDelete(view),
                    },
                  ]}
                >
                  <MoreHorizontal aria-hidden="true" />
                </MenuButton>
              )}
            </li>
          );
        })}
      </ul>

      {canSave &&
        (naming ? (
          <div className="memex-view-save is-naming" aria-busy={savePending}>
            <ViewNameField
              initial={suggestedName}
              submitLabel={savePending ? 'Saving…' : 'Save'}
              onSubmit={(name) => void handleSave(name)}
              onCancel={() => {
                if (savePending) return;
                setNaming(false);
                requestAnimationFrame(() => saveButtonRef.current?.focus());
              }}
            />
          </div>
        ) : (
          <button
            ref={saveButtonRef}
            type="button"
            className="memex-view-save"
            onClick={() => setNaming(true)}
            title="Save these filters as a view"
          >
            <Plus aria-hidden="true" />
            <span>Save view</span>
          </button>
        ))}
    </nav>
  );
};

export default LibraryViewTabs;
