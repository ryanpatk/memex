import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, LayoutGrid, MoreHorizontal, Pencil, Plus, Rows3, Save, Table2, Trash2 } from 'lucide-react';
import {
  SORT_OPTIONS,
  SOURCE_KEYS,
  normalizeViewName,
  sameSort,
  sortLabel,
  sourceKeyLabel,
  type ItemType,
  type LibraryLayout,
  type LibrarySort,
  type LibraryView,
  type SourceKey,
} from '@memex/core';
import Menu from './Menu';
import Popover from './Popover';

export interface ViewPanelTab {
  view: LibraryView;
  count: number;
  href: string;
}

interface ViewPanelProps {
  open: boolean;
  onClose: () => void;
  /** The ••• button, so focus can go back to it. */
  anchor: HTMLElement | null;
  layout: LibraryLayout;
  onLayout: (layout: LibraryLayout) => void;
  types: readonly ItemType[];
  onToggleType: (type: ItemType) => void;
  unfiledOnly: boolean;
  onToggleUnfiled: () => void;
  sources: readonly string[];
  onToggleSource: (source: SourceKey) => void;
  sort: LibrarySort;
  onSort: (sort: LibrarySort) => void;
  tabs: ViewPanelTab[];
  activeViewId: string | null;
  onOpenView: (view: LibraryView) => void;
  canSave: boolean;
  suggestedName: string;
  onSave: (name: string) => Promise<unknown>;
  canUpdate: boolean;
  onUpdate: (view: LibraryView) => void;
  onRename: (view: LibraryView, name: string) => void;
  onDelete: (view: LibraryView) => void;
  onReset: () => void;
  canReset: boolean;
  /** Extra rows at the foot (Select cards, Open space page…). */
  footer?: ReactNode;
}

const LAYOUTS: { value: LibraryLayout; label: string; icon: ReactNode }[] = [
  { value: 'grid', label: 'Cards', icon: <LayoutGrid aria-hidden="true" /> },
  { value: 'list', label: 'List', icon: <Rows3 aria-hidden="true" /> },
  { value: 'table', label: 'Table', icon: <Table2 aria-hidden="true" /> },
];

const TYPE_CHIPS: { value: ItemType; label: string }[] = [
  { value: 'link', label: 'Links' },
  { value: 'note', label: 'Notes' },
  { value: 'task', label: 'Tasks' },
];

const QUICK_SORTS: LibrarySort[] = [
  { field: 'updated', direction: 'desc' },
  { field: 'saved', direction: 'desc' },
  { field: 'title', direction: 'asc' },
];
const QUICK_LABELS = ['Updated', 'Saved', 'Title'];
const numberFormat = new Intl.NumberFormat();

/**
 * The View panel (d06): everything the classic Library kept on screen, behind
 * •••. Three big layout tiles (Cards · List · Table), then chips for Show
 * (types, Unfiled only), From (sources), Sort (Updated · Saved · Title ·
 * More…) and Saved views (each a link; ••• to rename, update or delete;
 * + Save view). A non-modal popover: Esc or a click outside closes it and
 * focus returns to •••.
 */
const ViewPanel = (props: ViewPanelProps) => {
  const { open, onClose, anchor } = props;
  const panelRef = useRef<HTMLDivElement>(null);
  const [naming, setNaming] = useState<null | { mode: 'save' } | { mode: 'rename'; view: LibraryView }>(null);

  useEffect(() => {
    if (!open) {
      setNaming(null);
      return;
    }
    requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>('button, a')?.focus());
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      // Menus the panel opens nest inside it (popoverPlacement.ts → popoverHost)
      if (panelRef.current?.contains(target) || anchor?.contains(target)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      onClose();
      anchor?.focus();
    };
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [anchor, onClose, open]);

  if (!open) return null;
  const allTypes = props.types.length === 0;
  const moreSort = !QUICK_SORTS.some((option) => sameSort(option, props.sort));
  const tabs = props.tabs.filter((tab) => tab.view.id !== 'everything' && tab.view.id !== 'unfiled');

  return (
    <Popover anchor={anchor} open={open} placement="bottom-end" popoverRef={panelRef} className="mc-view-panel" role="dialog" aria-label="View">
      <div className="mc-view-head">
        <h2 className="mc-h2">View</h2>
        <button type="button" className="mc-btn is-quiet is-small" onClick={props.onReset} disabled={!props.canReset}>
          Reset
        </button>
      </div>

      <div className="mc-view-layouts" role="radiogroup" aria-label="Layout">
        {LAYOUTS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={props.layout === option.value}
            className="mc-choice"
            onClick={() => props.onLayout(option.value)}
          >
            {option.icon}
            {option.label}
          </button>
        ))}
      </div>

      <p className="mc-sec mc-view-sec">Show</p>
      <div className="mc-view-chips">
        {TYPE_CHIPS.map((chip) => {
          const on = allTypes || props.types.includes(chip.value);
          return (
            <button
              key={chip.value}
              type="button"
              className="mc-chip"
              aria-pressed={on}
              onClick={() => props.onToggleType(chip.value)}
            >
              {on && <Check aria-hidden="true" />}
              <span>{chip.label}</span>
            </button>
          );
        })}
        <button type="button" className="mc-chip" aria-pressed={props.unfiledOnly} onClick={props.onToggleUnfiled}>
          {props.unfiledOnly && <Check aria-hidden="true" />}
          <span>Unfiled only</span>
        </button>
      </div>

      <p className="mc-sec mc-view-sec">From</p>
      <div className="mc-view-chips">
        {SOURCE_KEYS.map((key) => {
          const on = props.sources.includes(key);
          return (
            <button key={key} type="button" className="mc-chip" aria-pressed={on} onClick={() => props.onToggleSource(key)}>
              {on && <Check aria-hidden="true" />}
              <span>{sourceKeyLabel(key)}</span>
            </button>
          );
        })}
      </div>

      <p className="mc-sec mc-view-sec">Sort</p>
      <div className="mc-view-chips">
        {QUICK_SORTS.map((option, index) => {
          const on = sameSort(option, props.sort);
          return (
            <button key={QUICK_LABELS[index]} type="button" className="mc-chip" aria-pressed={on} onClick={() => props.onSort(option)}>
              {on && <Check aria-hidden="true" />}
              <span>{QUICK_LABELS[index]}</span>
            </button>
          );
        })}
        <Menu
          label="More sorts"
          align="start"
          entries={SORT_OPTIONS.map((option) => ({
            id: `${option.field}:${option.direction}`,
            label: sortLabel(option),
            checked: sameSort(option, props.sort),
            onSelect: () => props.onSort(option),
          }))}
          trigger={(triggerProps) => (
            <button {...triggerProps} type="button" className={`mc-chip${moreSort ? ' is-on' : ''}`}>
              {moreSort && <Check aria-hidden="true" />}
              <span>{moreSort ? sortLabel(props.sort) : 'More…'}</span>
            </button>
          )}
        />
      </div>

      <p className="mc-sec mc-view-sec">Saved views</p>
      <div className="mc-view-chips">
        {tabs.map((tab) => {
          const active = tab.view.id === props.activeViewId;
          return (
            <span key={tab.view.id} className={`mc-view-saved${active ? ' is-active' : ''}`}>
              <Link
                to={tab.href}
                className={`mc-chip${active ? ' is-on' : ''}`}
                aria-current={active ? 'true' : undefined}
                onClick={() => props.onOpenView(tab.view)}
              >
                <span>{tab.view.name}</span>
                <em>{numberFormat.format(tab.count)}</em>
              </Link>
              {!tab.view.builtIn && (
                <Menu
                  label={`${tab.view.name} options`}
                  align="start"
                  entries={[
                    {
                      id: 'update',
                      label: 'Save layout and sort',
                      icon: <Save />,
                      disabled: !(active && props.canUpdate),
                      onSelect: () => props.onUpdate(tab.view),
                    },
                    { id: 'rename', label: 'Rename…', icon: <Pencil />, onSelect: () => setNaming({ mode: 'rename', view: tab.view }) },
                    { kind: 'separator', id: 'sep' },
                    { id: 'delete', label: 'Delete view', icon: <Trash2 />, danger: true, onSelect: () => props.onDelete(tab.view) },
                  ]}
                  trigger={(triggerProps) => (
                    <button {...triggerProps} type="button" className="mc-rb is-small mc-view-saved-more" aria-label={`${tab.view.name} options`}>
                      <MoreHorizontal aria-hidden="true" />
                    </button>
                  )}
                />
              )}
            </span>
          );
        })}
        {props.canSave && !naming && (
          <button type="button" className="mc-chip" onClick={() => setNaming({ mode: 'save' })}>
            <Plus aria-hidden="true" />
            <span>Save view</span>
          </button>
        )}
      </div>
      {naming && (
        <ViewNameForm
          key={naming.mode === 'rename' ? naming.view.id : 'save'}
          initial={naming.mode === 'rename' ? naming.view.name : props.suggestedName}
          submitLabel={naming.mode === 'rename' ? 'Rename' : 'Save view'}
          onCancel={() => setNaming(null)}
          onSubmit={async (name) => {
            if (naming.mode === 'rename') props.onRename(naming.view, name);
            else await props.onSave(name);
            setNaming(null);
          }}
        />
      )}
      {props.footer && <div className="mc-view-foot">{props.footer}</div>}
    </Popover>
  );
};

const ViewNameForm = ({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: string;
  submitLabel: string;
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
}) => {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const name = normalizeViewName(value);
    if (!name) return inputRef.current?.focus();
    setBusy(true);
    try {
      await onSubmit(name);
    } catch {
      setBusy(false);
    }
  };
  return (
    <form className="mc-view-name" onSubmit={submit}>
      <label className="mc-sr-only" htmlFor="mc-view-name">
        View name
      </label>
      <input
        id="mc-view-name"
        ref={inputRef}
        className="mc-inp"
        value={value}
        placeholder="View name…"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
          }
        }}
      />
      <button type="submit" className="mc-btn is-primary is-small" aria-busy={busy || undefined} disabled={busy}>
        {submitLabel}
      </button>
    </form>
  );
};

export default ViewPanel;
