import { Fragment, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Check, ExternalLink, Link as LinkIcon, StickyNote, Square, X } from 'lucide-react';
import {
  ariaSortFor,
  getHostname,
  itemSavedAt,
  itemSourceLabel,
  itemTitle,
  itemTypeLabel,
  nextRowIndex,
  relativeTime,
  sourceOf,
  type LibrarySort,
  type LinkWithTag,
  type NoteWithTags,
  type SortField,
  type StreamItem,
  type TableColumn,
  type TaskWithTags,
} from '@memex/core';
import { handleBackgroundLinkClick } from '../../utils/openUrlInBackgroundTab';

export interface TableSpace {
  id: string;
  name: string;
  color?: string;
}

interface LibraryTableProps {
  items: StreamItem[];
  columns: TableColumn[];
  sort: LibrarySort;
  onSort: (field: SortField) => void;
  spacesOf: (key: string) => TableSpace[];
  selectionMode: boolean;
  selectedKeys: ReadonlySet<string>;
  /** Toggle one row; starts selecting when not already. */
  onToggleSelect: (item: StreamItem) => void;
  /** Header checkbox: select every row, or clear them. */
  onSelectAll: (keys: string[]) => void;
  onClearSelection: () => void;
  expandedLinkId: string | null;
  renderExpanded: (link: LinkWithTag) => ReactNode;
  onOpenLinkDetails: (link: LinkWithTag) => void;
  onOpenUrl: (link: LinkWithTag) => void;
  onOpenNote: (note: NoteWithTags) => void;
  onToggleTaskDone: (task: TaskWithTags) => void;
  onDelete: (item: StreamItem) => void;
  brokenPreviews: ReadonlySet<string>;
  onPreviewError: (linkId: string) => void;
}

const fullDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const MAX_SPACE_CHIPS = 2;

const isPending = (item: StreamItem) => item.id.startsWith('temp-');

const Leading = ({ item, broken, onError, onToggleTaskDone }: {
  item: StreamItem;
  broken: boolean;
  onError: () => void;
  onToggleTaskDone: (task: TaskWithTags) => void;
}) => {
  if (item.type === 'task') {
    const { task } = item;
    return (
      <span className="memex-table-leading is-task">
        <button
          type="button"
          role="checkbox"
          aria-checked={task.is_done}
          className="memex-task-check"
          onClick={() => onToggleTaskDone(task)}
          aria-label={task.is_done ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`}
          tabIndex={-1}
        >
          <Check aria-hidden="true" />
        </button>
      </span>
    );
  }
  if (item.type === 'note') {
    return (
      <span className="memex-table-leading">
        <StickyNote aria-hidden="true" />
      </span>
    );
  }
  const { link } = item;
  if (link.preview_image_url && !broken) {
    return (
      <span className="memex-table-leading is-picture">
        <img src={link.preview_image_url} alt="" loading="lazy" decoding="async" onError={onError} />
      </span>
    );
  }
  return (
    <span className="memex-table-leading">
      {link.favicon_url ? <img className="is-favicon" src={link.favicon_url} alt="" loading="lazy" /> : <LinkIcon aria-hidden="true" />}
    </span>
  );
};

const TypeGlyph = ({ item }: { item: StreamItem }) =>
  item.type === 'link' ? (
    <LinkIcon aria-hidden="true" />
  ) : item.type === 'note' ? (
    <StickyNote aria-hidden="true" />
  ) : (
    <Square aria-hidden="true" />
  );

const DateCell = ({ iso }: { iso: string }) => (
  <time dateTime={iso} title={fullDate.format(new Date(iso))}>
    {relativeTime(iso)}
  </time>
);

/**
 * The Library as a table (decision 15A): sortable columns, one row per item,
 * the same selection, details-in-place and Undo as the grid. Rows are the
 * keyboard stops: ↑/↓/Home/End move, Enter opens, X selects, Delete deletes.
 */
const LibraryTable = ({
  items,
  columns,
  sort,
  onSort,
  spacesOf,
  selectionMode,
  selectedKeys,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  expandedLinkId,
  renderExpanded,
  onOpenLinkDetails,
  onOpenUrl,
  onOpenNote,
  onToggleTaskDone,
  onDelete,
  brokenPreviews,
  onPreviewError,
}: LibraryTableProps) => {
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  const selectable = items.filter((item) => !isPending(item));
  const selectedHere = selectable.filter((item) => selectedKeys.has(item.key)).length;
  const allSelected = selectable.length > 0 && selectedHere === selectable.length;
  const someSelected = selectedHere > 0 && !allSelected;
  // Roving tab stop: the last focused row, else the first
  const tabStopKey = items.some((item) => item.key === focusKey) ? focusKey : (items[0]?.key ?? null);

  const activate = (item: StreamItem) => {
    if (isPending(item)) return;
    if (selectionMode) {
      onToggleSelect(item);
      return;
    }
    if (item.type === 'link') onOpenLinkDetails(item.link);
    else if (item.type === 'note') onOpenNote(item.note);
  };

  const focusRow = (index: number) => {
    const rows = bodyRef.current?.querySelectorAll<HTMLTableRowElement>('tr[data-item-key]');
    rows?.[index]?.focus();
  };

  const onRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, item: StreamItem, index: number) => {
    if (event.target !== event.currentTarget) return;
    const next = nextRowIndex(event.key, index, items.length);
    if (next !== null) {
      event.preventDefault();
      focusRow(next);
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) {
      if (event.key === 'Enter' && item.type === 'link') {
        event.preventDefault();
        onOpenUrl(item.link);
      }
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (item.type === 'task' && !selectionMode) onToggleTaskDone(item.task);
      else activate(item);
    } else if (event.key === ' ' || event.key.toLowerCase() === 'x') {
      event.preventDefault();
      if (!isPending(item)) onToggleSelect(item);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      if (!isPending(item)) {
        focusRow(index < items.length - 1 ? index + 1 : index - 1);
        onDelete(item);
      }
    }
  };

  const onRowClick = (event: MouseEvent<HTMLTableRowElement>, item: StreamItem) => {
    // Controls inside the row keep their own behaviour
    if ((event.target as HTMLElement).closest('button, a, input')) return;
    activate(item);
  };

  const renderCell = (column: TableColumn, item: StreamItem) => {
    switch (column.id) {
      case 'title':
        return (
          <span className="memex-table-title">
            <Leading
              item={item}
              broken={item.type === 'link' && brokenPreviews.has(item.id)}
              onError={() => onPreviewError(item.id)}
              onToggleTaskDone={onToggleTaskDone}
            />
            <span className="memex-table-title-text">{itemTitle(item)}</span>
          </span>
        );
      case 'type':
        return (
          <span className="memex-table-type">
            <TypeGlyph item={item} />
            {itemTypeLabel(item)}
          </span>
        );
      case 'source': {
        const label = itemSourceLabel(item);
        if (!label || item.type !== 'link') return null;
        const isPlatform = sourceOf(item.link).key !== 'web';
        return (
          <span className={`memex-table-source${isPlatform ? ' is-platform' : ''}`} translate="no">
            {isPlatform ? label : getHostname(item.link.url)}
          </span>
        );
      }
      case 'spaces': {
        const spaces = spacesOf(item.key);
        if (!spaces.length) return null;
        const shown = spaces.slice(0, MAX_SPACE_CHIPS);
        return (
          <span className="memex-table-spaces">
            {shown.map((space) => (
              <span
                key={space.id}
                className="memex-table-space"
                style={{ ['--space-hue' as string]: space.color }}
                title={space.name}
              >
                <span className="memex-space-dot" style={{ background: space.color }} aria-hidden="true" />
                <span className="memex-table-space-name">{space.name}</span>
              </span>
            ))}
            {spaces.length > MAX_SPACE_CHIPS && (
              <span
                className="memex-table-more"
                title={spaces.slice(MAX_SPACE_CHIPS).map((space) => space.name).join(', ')}
              >
                +{spaces.length - MAX_SPACE_CHIPS}
              </span>
            )}
          </span>
        );
      }
      case 'tags':
        return item.tags.length ? (
          <span className="memex-table-tags">{item.tags.map((tag) => `#${tag.name}`).join(' ')}</span>
        ) : null;
      case 'saved':
        return <DateCell iso={itemSavedAt(item)} />;
      case 'updated':
        return <DateCell iso={item.updatedAt} />;
    }
  };

  const colSpan = columns.length + 2;

  return (
    <div className="memex-table-wrap">
      <table className={`memex-table${selectionMode ? ' is-selecting' : ''}`} aria-label="Library" aria-rowcount={items.length + 1}>
        <caption className="sr-only">
          Library items. Arrow keys move between rows; Enter opens; X selects; Delete removes, with Undo.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="memex-table-col-check">
              <button
                type="button"
                role="checkbox"
                aria-checked={allSelected ? true : someSelected ? 'mixed' : false}
                aria-label={allSelected ? 'Clear selection' : `Select all ${selectable.length} rows`}
                className={`memex-select-check memex-table-check${allSelected ? ' is-on' : ''}${someSelected ? ' is-mixed' : ''}`}
                onClick={() => (allSelected ? onClearSelection() : onSelectAll(selectable.map((item) => item.key)))}
                disabled={selectable.length === 0}
              >
                {allSelected ? <Check aria-hidden="true" /> : someSelected ? <span className="memex-table-check-dash" aria-hidden="true" /> : null}
              </button>
            </th>
            {columns.map((column) => {
              const ariaSort = ariaSortFor(column, sort);
              return (
                <th
                  key={column.id}
                  scope="col"
                  className={`memex-table-col-${column.id}${ariaSort !== 'none' ? ' is-sorted' : ''}`}
                  data-priority={column.priority}
                  aria-sort={column.sortField ? ariaSort : undefined}
                >
                  {column.sortField ? (
                    <button type="button" className="memex-table-sort" onClick={() => onSort(column.sortField!)}>
                      <span>{column.label}</span>
                      {ariaSort === 'ascending' ? (
                        <ArrowUp aria-hidden="true" />
                      ) : ariaSort === 'descending' ? (
                        <ArrowDown aria-hidden="true" />
                      ) : (
                        <ArrowDown aria-hidden="true" className="is-idle" />
                      )}
                    </button>
                  ) : (
                    <span className="memex-table-sort is-static">{column.label}</span>
                  )}
                </th>
              );
            })}
            <th scope="col" className="memex-table-col-actions">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody ref={bodyRef}>
          {items.map((item, index) => {
            const selected = selectedKeys.has(item.key);
            const expanded = item.type === 'link' && expandedLinkId === item.id;
            const done = item.type === 'task' && item.task.is_done;
            const title = itemTitle(item);
            return (
              <Fragment key={item.key}>
                <tr
                  data-item-key={item.key}
                  aria-rowindex={index + 2}
                  tabIndex={item.key === tabStopKey ? 0 : -1}
                  className={`memex-table-row${selected ? ' is-selected' : ''}${expanded ? ' is-expanded' : ''}${done ? ' is-done' : ''}${isPending(item) ? ' is-new' : ''}${item.type === 'task' && !selectionMode ? '' : ' is-openable'}`}
                  onFocus={(event) => {
                    if (event.target === event.currentTarget) setFocusKey(item.key);
                  }}
                  onClick={(event) => onRowClick(event, item)}
                  onKeyDown={(event) => onRowKeyDown(event, item, index)}
                >
                  <td className="memex-table-col-check">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={selected}
                      aria-label={`Select ${title}`}
                      className={`memex-select-check memex-table-check${selected ? ' is-on' : ''}`}
                      onClick={() => !isPending(item) && onToggleSelect(item)}
                      tabIndex={-1}
                    >
                      {selected && <Check aria-hidden="true" />}
                    </button>
                  </td>
                  {columns.map((column) => (
                    <td key={column.id} className={`memex-table-col-${column.id}`} data-priority={column.priority}>
                      {renderCell(column, item)}
                    </td>
                  ))}
                  <td className="memex-table-col-actions">
                    <span className="memex-table-actions">
                      {item.type === 'link' && (
                        <a
                          className="memex-icon-button is-compact"
                          href={item.link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={handleBackgroundLinkClick}
                          aria-label={`Open ${title} in a new tab`}
                          title="Open link"
                          tabIndex={-1}
                        >
                          <ExternalLink aria-hidden="true" />
                        </a>
                      )}
                      <button
                        type="button"
                        className="memex-icon-button is-compact"
                        onClick={() => onDelete(item)}
                        aria-label={`Delete “${title}”`}
                        title="Delete"
                        tabIndex={-1}
                      >
                        <X aria-hidden="true" />
                      </button>
                    </span>
                  </td>
                </tr>
                {expanded && item.type === 'link' && (
                  <tr className="memex-table-expanded">
                    <td colSpan={colSpan}>{renderExpanded(item.link)}</td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default LibraryTable;
