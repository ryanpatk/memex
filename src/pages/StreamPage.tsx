import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link as RouterLink, useNavigate, useNavigationType, useSearchParams } from 'react-router-dom';
import { useCardLabels } from '../hooks/useCardLabels';
import { useAllSelfMessages } from '../hooks/useSelfMessages';
import { JotMemoryCard, LinkMemoryCard, NoteMemoryCard, TaskMemoryCard } from '../components/cards/cards';
import CaptureSheet from '../components/cards/CaptureSheet';
import OpenCardSheet, { type RescrapeResult } from '../components/cards/OpenCardSheet';
import ViewPanel, { type ViewPanelTab } from '../components/cards/ViewPanel';
import SpacePillRow from '../components/cards/SpacePillRow';
import StickyBar from '../components/cards/StickyBar';
import CardsSelectionBar from '../components/cards/SelectionBar';
import MoveSheet from '../components/cards/MoveSheet';
import NewSpaceSheet from '../components/cards/NewSpaceSheet';
import { EmptySlot } from '../components/cards/Controls';
import CardsSkeleton from '../components/cards/CardsSkeleton';
import { gridShowsJots, interleaveNewestFirst, jotMatches, toggleShownType } from '../utils/cardsGrid';
import {
  jotCardHeight,
  linkCardHeight,
  noteCardHeight,
  pictureCardHeight,
  taskCardHeight,
} from '../utils/memoryCardEstimates';
import LibraryTable, { type TableSpace } from '../components/library/LibraryTable';
import MasonryLayout, { type MasonryItem } from '../components/stream/MasonryLayout';
import StreamRow from '../components/stream/StreamRow';
import NoteEditor from '../components/NoteEditor';
import { FeedbackToast } from '../components/ui';
import {
  ITEM_TYPES,
  type ItemType,
  LinkWithTag,
  NoteWithTags,
  SelfMessage,
  TaskWithTags,
  UpdateNoteData,
  getHostname,
  getLinkTitle,
  markdownExcerpt,
  noteDisplayTitle,
  dueDateIso,
  groupByTime,
  relativeTime,
  StreamItem,
  buildStreamItems,
  BUILT_IN_VIEWS,
  SORT_OPTIONS,
  UNFILED,
  countMatching,
  findActiveView,
  formatLibraryFilters,
  formatSort,
  groupDateFor,
  isHideableWhenEmpty,
  matchesLibraryFilters,
  nextSort,
  nextViewPosition,
  parseLibraryFilters,
  parseSort,
  sameSort,
  sanitizeFilters,
  savedViewsToTabs,
  serializeViewDefinition,
  sortItems,
  sortLabel,
  spaceIdsByItem,
  suggestViewName,
  tableColumns,
  uniqueViewName,
  viewDiffers,
  type LibraryFilters,
  type LibraryLayout,
  type LibrarySort,
  type LibraryView,
  type SortField,
  isPendingItem,
  itemKey,
  itemMatchesSearch,
  isDoneTask,
  matchesTagFilter,
  matchesTypeFilter,
} from '@memex/core';
import {
  JOURNAL_PATH,
  spacePath,
  LIBRARY_PATH,
  LINK_PARAM,
  NOTE_PARAM,
  SHOW_TAGS_UI,
  SORT_PARAM,
  SOURCE_PARAM,
  SPACE_PARAM,
  VIEW_PARAM,
  TAGS_PARAM,
  TYPE_PARAM,
  UNTAGGED_PARAM,
} from '../constants/modules';
import { useFeedbackToast } from '../hooks/useFeedbackToast';
import { useAddToSpace } from '../hooks/useAddToSpace';
import { useAllLinks, useDeleteLink, useUpdateLink } from '../hooks/useLinks';
import { useAllNotes, useDeleteNote, useUpdateNote } from '../hooks/useNotes';
import { useProfileLinkMembership } from '../hooks/useProfileLinks';
import { usePinScope, usePins } from '../hooks/usePins';
import { useProfileNoteMembership } from '../hooks/useProfileNotes';
import { useProfileTaskMembership } from '../hooks/useProfileTasks';
import { useProfiles } from '../hooks/useProfiles';
import { useTags } from '../hooks/useTags';
import { useAllTasks, useDeleteTask, useUpdateTask } from '../hooks/useTasks';
import { useCreateSavedView, useDeleteSavedView, useSavedViews, useUpdateSavedView } from '../hooks/useSavedViews';
import { urlScraperApi } from '../hooks/useUrlScraper';
import { useAppStore } from '../store';
import { handleBackgroundLinkClick, openUrlInBackgroundTab } from '../utils/openUrlInBackgroundTab';
import { cue } from '../utils/sound';
import { HANDLES_ERRORS } from '../utils/mutationErrors';
import { loadStateOf } from '../utils/loadState';
import { useSpaceColors } from '../hooks/useSpaceColors';
import { useStableCallback } from '../hooks/useStableCallback';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { getImageRatio, getShownRatio, layoutRatio, prefetchImageRatios, subscribeImageRatios } from '../utils/imageRatios';
import {
  AlertTriangle,
  MoreHorizontal,
  Search,
  Check,
  ExternalLink,
  Link as LinkIcon,
  Plus,
  StickyNote,
  X,
} from 'lucide-react';

const VIEW_STORAGE_KEY = 'memex.stream-view';
const UNDO_WINDOW_MS = 6000;

type StreamView = LibraryLayout;

const isStreamView = (value: string | null): value is StreamView =>
  value === 'grid' || value === 'list' || value === 'table';

const readStoredView = (): StreamView => {
  try {
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return isStreamView(stored) ? stored : 'grid';
  } catch {
    return 'grid';
  }
};

const storeView = (next: StreamView) => {
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, next);
  } catch {
    /* storage unavailable — URL still carries it */
  }
};

const numberFormat = new Intl.NumberFormat();
const MC_TYPE_KEYS: readonly ItemType[] = ['link', 'note', 'task'];

/** When an item was first saved (the Saved sort), for weaving jots into the grid. */
const itemCreatedAt = (item: StreamItem) =>
  item.type === 'link' ? item.link.created_at : item.type === 'note' ? item.note.created_at : item.task.created_at;

/** A note's grid excerpt length, worked out once per note version (estimates run on every layout). */
const excerptLengths = new WeakMap<NoteWithTags, number>();
const noteExcerptLength = (note: NoteWithTags) => {
  let length = excerptLengths.get(note);
  if (length === undefined) {
    length = markdownExcerpt(note.body, 420).length;
    excerptLengths.set(note, length);
  }
  return length;
};

/** The URL params a Library filter set writes (the app's names for core's FilterParams). */
const FILTER_PARAM_NAMES = {
  type: TYPE_PARAM,
  source: SOURCE_PARAM,
  space: SPACE_PARAM,
  tags: TAGS_PARAM,
  untagged: UNTAGGED_PARAM,
} as const;

/**
 * The Library (“Cards”): a mixed stream of notes, links, tasks and jots —
 * everything at /library (a space's own page is SpacePage) — as Memory
 * Cards under a hero, one save/search field and the space pills; layouts,
 * filters, sort and saved views live in the ••• View panel.
 */
const StreamPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [searchQuery, setSearchQuery] = useState('');
  // The input stays instant; the grid follows once typing pauses, rendered
  // at low priority so a keystroke never waits on it
  const gridSearch = useDeferredValue(useDebouncedValue(searchQuery, 120));
  const navigationType = useNavigationType();
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(() => new Set());
  const [brokenPreviews, setBrokenPreviews] = useState<Set<string>>(() => new Set());

  const selectionMode = useAppStore((state) => state.selectionMode);
  const selectedItemKeys = useAppStore((state) => state.selectedItemKeys);
  const setSelectionMode = useAppStore((state) => state.setSelectionMode);
  const toggleItemSelection = useAppStore((state) => state.toggleItemSelection);
  const setItemSelection = useAppStore((state) => state.setItemSelection);
  const clearItemSelection = useAppStore((state) => state.clearItemSelection);

  const linksQuery = useAllLinks();
  const notesQuery = useAllNotes();
  const tasksQuery = useAllTasks();
  const allLinks = linksQuery.data;
  const allNotes = notesQuery.data;
  const allTasks = tasksQuery.data;
  const loadState = loadStateOf([linksQuery, notesQuery, tasksQuery]);
  /** First load with nothing cached yet: the grid shows its skeleton, never the empty state. */
  const itemsPending = loadState === 'loading';
  const { refetch: refetchLinks } = linksQuery;
  const { refetch: refetchNotes } = notesQuery;
  const { refetch: refetchTasks } = tasksQuery;
  const refetchLibrary = useCallback(
    () => Promise.all([refetchLinks(), refetchNotes(), refetchTasks()]),
    [refetchLinks, refetchNotes, refetchTasks],
  );
  const { data: profiles } = useProfiles();
  const spaceColors = useSpaceColors();
  const { data: tags } = useTags();
  const { data: linkMembership } = useProfileLinkMembership();
  const { data: noteMembership } = useProfileNoteMembership();
  const { data: taskMembership } = useProfileTaskMembership();
  const updateLink = useUpdateLink(HANDLES_ERRORS);
  const deleteLink = useDeleteLink();
  const updateNote = useUpdateNote(HANDLES_ERRORS);
  const deleteNote = useDeleteNote();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const { toast, flash, dismiss: dismissToast, handleAnimationEnd } = useFeedbackToast();

  /* ---------- URL state: type filter, tag filter, open note ---------- */

  // Every Library filter (docs/library-views.md)
  const urlFilters = useMemo<LibraryFilters>(
    () =>
      parseLibraryFilters({
        type: searchParams.get(TYPE_PARAM),
        source: searchParams.get(SOURCE_PARAM),
        space: searchParams.get(SPACE_PARAM),
        tags: searchParams.get(TAGS_PARAM),
        untagged: searchParams.get(UNTAGGED_PARAM),
      }),
    [searchParams],
  );
  const selectedTypes = urlFilters.types;
  const selectedTagIds = urlFilters.tagIds;
  const includeUntagged = urlFilters.untagged;
  const selectedSources = urlFilters.sources;
  const sortParam = searchParams.get(SORT_PARAM);
  const sort = useMemo(() => parseSort(sortParam), [sortParam]);
  const openNoteId = searchParams.get(NOTE_PARAM);
  const expandedLinkId = searchParams.get(LINK_PARAM);
  const viewParam = searchParams.get(VIEW_PARAM);
  const view: StreamView = isStreamView(viewParam) ? viewParam : readStoredView();

  const updateParams = useCallback(
    (mutate: (params: URLSearchParams) => void, replace = false) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          mutate(next);
          return next;
        },
        { replace },
      );
    },
    [setSearchParams],
  );

  const setListParam = useCallback(
    (params: URLSearchParams, key: string, values: string[]) => {
      if (values.length === 0) params.delete(key);
      else params.set(key, values.join(','));
    },
    [],
  );

  const openNote = useCallback(
    (noteId: string) => updateParams((params) => params.set(NOTE_PARAM, noteId)),
    [updateParams],
  );

  const closeNote = useCallback(
    () => updateParams((params) => params.delete(NOTE_PARAM)),
    [updateParams],
  );

  const setExpandedLinkId = useCallback(
    (linkId: string | null) =>
      updateParams((params) => {
        if (linkId) params.set(LINK_PARAM, linkId);
        else params.delete(LINK_PARAM);
      }),
    [updateParams],
  );

  const setView = useCallback(
    (next: StreamView) => {
      storeView(next);
      updateParams((params) => {
        if (next === 'grid') params.delete(VIEW_PARAM);
        else params.set(VIEW_PARAM, next);
      }, true);
    },
    [updateParams],
  );

  const toggleListValue = useCallback(
    (key: string, values: readonly string[], value: string) =>
      updateParams((params) =>
        setListParam(params, key, values.includes(value) ? values.filter((v) => v !== value) : [...values, value]),
      ),
    [setListParam, updateParams],
  );

  const setSort = useCallback(
    (next: LibrarySort) =>
      updateParams((params) => {
        const value = formatSort(next);
        if (value) params.set(SORT_PARAM, value);
        else params.delete(SORT_PARAM);
      }, true),
    [updateParams],
  );

  const sortBy = useCallback((field: SortField) => setSort(nextSort(sort, field)), [setSort, sort]);

  // J opens the Journal from anywhere outside a text field (the docked
  // Journal panel was cut with Memory Cards, x04)
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'j' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      navigate(JOURNAL_PATH);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  /* ---------- Page chrome effects ---------- */

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');

    html.classList.add('dashboard-scroll-lock');
    body.classList.add('dashboard-scroll-lock');
    root?.classList.add('dashboard-scroll-lock');

    return () => {
      html.classList.remove('dashboard-scroll-lock');
      body.classList.remove('dashboard-scroll-lock');
      root?.classList.remove('dashboard-scroll-lock');
    };
  }, []);

  /* ---------- Items ---------- */

  // Items deleted in the last few seconds stay hidden until Undo expires
  const allItems = useMemo(
    () => buildStreamItems(allLinks, allNotes, allTasks).filter((item) => !hiddenKeys.has(item.key)),
    [allLinks, allNotes, allTasks, hiddenKeys],
  );

  const itemsByKey = useMemo(() => {
    const map = new Map<string, StreamItem>();
    allItems.forEach((item) => map.set(item.key, item));
    return map;
  }, [allItems]);

  /** Space ids per item key, for the Space filter, the Table and sorting by space. */
  const spacesByItem = useMemo(
    () => spaceIdsByItem({ links: linkMembership, notes: noteMembership, tasks: taskMembership }),
    [linkMembership, noteMembership, taskMembership],
  );

  const spaceById = useMemo(() => new Map((profiles ?? []).map((p) => [p.id, p])), [profiles]);

  // Ids from a deleted space or tag (in an old link or saved view) are ignored
  // once spaces and tags have loaded
  const activeFilters = useMemo(
    () =>
      profiles && tags
        ? sanitizeFilters(urlFilters, {
            spaceIds: new Set(profiles.map((p) => p.id)),
            tagIds: new Set(tags.map((t) => t.id)),
          })
        : urlFilters,
    [profiles, tags, urlFilters],
  );

  // A capture while the Space filter holds exactly one space is filed there
  // (DESIGN.md: active filters apply to captures)
  const captureSpaceId =
    activeFilters.spaces.length === 1 && activeFilters.spaces[0] !== UNFILED ? activeFilters.spaces[0] : null;

  const matchesType = useCallback(
    (item: StreamItem) => matchesTypeFilter(item.type, selectedTypes),
    [selectedTypes],
  );

  const matchesTags = useCallback(
    (item: StreamItem) => {
      if (selectedTagIds.length === 0 && !includeUntagged) return true;
      return matchesTagFilter(
        item.tags.map((tag) => tag.id),
        selectedTagIds,
        includeUntagged,
      );
    },
    [includeUntagged, selectedTagIds],
  );

  const matchesSearch = useCallback(
    (item: StreamItem) => itemMatchesSearch(item, gridSearch),
    [gridSearch],
  );

  const spacesOf = useCallback(
    (key: string) => spacesByItem.get(key) ?? [],
    [spacesByItem],
  );

  /** Source + Space filters (the type and tag rows keep their own counts). */
  const matchesPlace = useCallback(
    (item: StreamItem) => {
      if (selectedSources.length === 0 && activeFilters.spaces.length === 0) return true;
      return matchesLibraryFilters(
        item,
        { types: [], tagIds: [], untagged: false, sources: selectedSources, spaces: activeFilters.spaces },
        { spacesOf },
      );
    },
    [activeFilters.spaces, selectedSources, spacesOf],
  );

  const spaceNamesOf = useCallback(
    (key: string) => spacesOf(key).map((id) => spaceById.get(id)?.name ?? ''),
    [spaceById, spacesOf],
  );

  const filteredItems = useMemo(
    () =>
      sortItems(
        allItems.filter((item) => matchesType(item) && matchesPlace(item) && matchesTags(item) && matchesSearch(item)),
        sort,
        { spaceNamesOf },
      ),
    [matchesPlace, matchesSearch, matchesTags, matchesType, allItems, sort, spaceNamesOf],
  );

  const openItems = useMemo(
    () => filteredItems.filter((item) => !isDoneTask(item)),
    [filteredItems],
  );

  const doneTasks = useMemo(
    () => filteredItems.filter(isDoneTask),
    [filteredItems],
  );

  // Selection survives filters and search (gather across several views);
  // arriving at the Library starts over
  useEffect(() => {
    clearItemSelection();
    setSelectionMode(false);
  }, [clearItemSelection, setSelectionMode]);

  // Drop keys whose items are gone (deleted here or elsewhere)
  useEffect(() => {
    if (selectedItemKeys.length === 0) return;
    const present = selectedItemKeys.filter((key) => itemsByKey.has(key));
    if (present.length !== selectedItemKeys.length) setItemSelection(present);
  }, [itemsByKey, selectedItemKeys, setItemSelection]);

  // Leaving Cards (unmount) must not leave the app in selection mode
  useEffect(() => () => setSelectionMode(false), [setSelectionMode]);

  const handleToggleSelectionMode = () => {
    const next = !selectionMode;
    setSelectionMode(next);
    if (next) setExpandedLinkId(null);
  };

  const handleToggleSelect = useCallback(
    (item: StreamItem) => {
      if (isPendingItem(item)) return;
      toggleItemSelection(item.key);
    },
    [toggleItemSelection],
  );

  /* ---------- Capture ---------- */

  const rawInput = searchQuery.trim();

  /* ---------- Item behaviors ---------- */

  const handleOpenLink = useCallback((link: LinkWithTag) => {
    openUrlInBackgroundTab(link.url);
  }, []);

  const handleOpenNote = useCallback(
    (note: NoteWithTags) => {
      if (note.id.startsWith('temp-')) return;
      openNote(note.id);
    },
    [openNote],
  );

  const handleToggleTaskDone = useCallback(
    (task: TaskWithTags) => {
      if (task.id.startsWith('temp-')) return;
      cue('toggle');
      updateTask.mutate({ id: task.id, updates: { is_done: !task.is_done } });
    },
    [updateTask],
  );

  /* ---------- Undoable delete ---------- */

  // A delete hides the item at once and commits after the Undo window;
  // leaving the page commits anything still pending.
  const pendingDeletes = useRef(
    new Map<string, { timer: ReturnType<typeof setTimeout>; commit: () => void }>(),
  );

  useEffect(() => {
    const pending = pendingDeletes.current;
    return () => {
      pending.forEach(({ timer, commit }) => {
        clearTimeout(timer);
        commit();
      });
      pending.clear();
    };
  }, []);

  // Hide every key now; one Undo restores them all, otherwise each commits
  const scheduleDeletes = useCallback(
    (entries: { key: string; commit: () => void }[], message: string) => {
      if (entries.length === 0) return;
      cue('dismiss');
      const keys = entries.map((entry) => entry.key);
      const unhide = () =>
        setHiddenKeys((prev) => {
          const next = new Set(prev);
          keys.forEach((key) => next.delete(key));
          return next;
        });
      setHiddenKeys((prev) => {
        const next = new Set(prev);
        keys.forEach((key) => next.add(key));
        return next;
      });
      entries.forEach(({ key, commit }) => {
        const finish = () => {
          pendingDeletes.current.delete(key);
          commit();
          setHiddenKeys((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        };
        const timer = setTimeout(finish, UNDO_WINDOW_MS);
        pendingDeletes.current.set(key, { timer, commit });
      });
      flash(message, {
        label: 'Undo',
        onClick: () => {
          let restored = false;
          keys.forEach((key) => {
            const entry = pendingDeletes.current.get(key);
            if (!entry) return;
            clearTimeout(entry.timer);
            pendingDeletes.current.delete(key);
            restored = true;
          });
          if (!restored) return;
          unhide();
          cue('confirm');
          dismissToast();
        },
      });
    },
    [dismissToast, flash],
  );

  const scheduleDelete = useCallback(
    (key: string, label: string, commit: () => void) =>
      scheduleDeletes([{ key, commit }], `Deleted “${label}”.`),
    [scheduleDeletes],
  );

  const handleDeleteTask = useCallback(
    (taskId: string) => {
      if (taskId.startsWith('temp-')) return;
      const task = (allTasks ?? []).find((t) => t.id === taskId);
      scheduleDelete(itemKey('task', taskId), task?.title ?? 'task', () => deleteTask.mutate(taskId));
    },
    [allTasks, deleteTask, scheduleDelete],
  );

  const handleDeleteNote = useCallback(
    (noteId: string) => {
      if (noteId.startsWith('temp-')) return;
      if (openNoteId === noteId) closeNote();
      const note = (allNotes ?? []).find((n) => n.id === noteId);
      scheduleDelete(itemKey('note', noteId), note ? noteDisplayTitle(note) : 'note', () =>
        deleteNote.mutate(noteId),
      );
    },
    [allNotes, closeNote, deleteNote, openNoteId, scheduleDelete],
  );

  const updateNoteAsync = updateNote.mutateAsync;
  const handleSaveNote = useCallback(
    (id: string, updates: UpdateNoteData) => updateNoteAsync({ id, updates }),
    [updateNoteAsync],
  );

  /* ---------- Journal: jots ---------- */

  const hiddenJotIds = useMemo(
    () =>
      new Set(
        Array.from(hiddenKeys)
          .filter((key) => key.startsWith('jot:'))
          .map((key) => key.slice(4)),
      ),
    [hiddenKeys],
  );

  /* ---------- Link expanded in place (?link=) ---------- */

  const expandedLink = useMemo(() => {
    if (!expandedLinkId) return undefined;
    const item = itemsByKey.get(itemKey('link', expandedLinkId));
    return item?.type === 'link' ? item.link : undefined;
  }, [expandedLinkId, itemsByKey]);

  // A stale ?link= (deleted link) is dropped once links have loaded
  useEffect(() => {
    if (expandedLinkId && allLinks && !expandedLink) setExpandedLinkId(null);
  }, [allLinks, expandedLink, expandedLinkId, setExpandedLinkId]);

  // Pins follow the top bar: this space's when one space is chosen, the global ones otherwise
  const pinScope = usePinScope();
  const pinsApi = usePins(pinScope.spaceId);
  const expandedIsPinned = expandedLinkId ? pinsApi.isPinned(expandedLinkId) : false;

  const handleOpenLinkDetails = useCallback(
    (link: LinkWithTag) => {
      if (link.id.startsWith('temp-')) return;
      clearItemSelection();
      setSelectionMode(false);
      setExpandedLinkId(expandedLinkId === link.id ? null : link.id);
    },
    [clearItemSelection, expandedLinkId, setExpandedLinkId, setSelectionMode],
  );

  const { pin: pinLinks, unpin: unpinLink } = pinsApi;
  const handleTogglePin = useCallback(
    async (next: boolean) => {
      if (!expandedLinkId) return;
      cue('toggle');
      if (next) await pinLinks([expandedLinkId]);
      else await unpinLink(expandedLinkId);
    },
    [expandedLinkId, pinLinks, unpinLink],
  );

  // Field-level merge: a fresh value overwrites, a missing one never blanks
  // out what's stored — a thinner scrape can only be a no-op.
  const handleRescrape = useCallback(async (): Promise<RescrapeResult> => {
    if (!expandedLink) return 'failed';
    const scraped = await urlScraperApi.tryScrape(expandedLink.url);
    // A successful scrape always carries a favicon; {} means the worker
    // errored or is unconfigured.
    if (!scraped.logo) return 'failed';

    const updates: Record<string, string> = {};
    if (scraped.title && scraped.title !== expandedLink.title) updates.title = scraped.title;
    if (scraped.description && scraped.description !== expandedLink.description) {
      updates.description = scraped.description;
    }
    if (scraped.logo !== expandedLink.favicon_url) updates.favicon_url = scraped.logo;
    if (scraped.image && scraped.image !== expandedLink.preview_image_url) {
      updates.preview_image_url = scraped.image;
    }

    if (Object.keys(updates).length === 0) return 'unchanged';
    await updateLink.mutateAsync({ id: expandedLink.id, updates });
    setBrokenPreviews((prev) => {
      const next = new Set(prev);
      next.delete(expandedLink.id);
      return next;
    });
    return 'updated';
  }, [expandedLink, updateLink]);

  const handleDeleteLink = useCallback(
    (link: LinkWithTag) => {
      if (link.id.startsWith('temp-')) return;
      if (expandedLinkId === link.id) setExpandedLinkId(null);
      scheduleDelete(itemKey('link', link.id), getLinkTitle(link), () => deleteLink.mutate(link.id));
    },
    [deleteLink, expandedLinkId, scheduleDelete, setExpandedLinkId],
  );

  /* ---------- Multi-select ---------- */

  const pageRef = useRef<HTMLDivElement>(null);
  const selectionAnchorRef = useRef<string | null>(null);
  const addToSpace = useAddToSpace(flash);

  const visibleKeySet = useMemo(() => new Set(filteredItems.map((item) => item.key)), [filteredItems]);
  const hiddenSelectedCount = selectedItemKeys.filter((key) => !visibleKeySet.has(key)).length;

  const exitSelection = useCallback(() => {
    clearItemSelection();
    setSelectionMode(false);
    selectionAnchorRef.current = null;
  }, [clearItemSelection, setSelectionMode]);

  /** Grid card keys in display order: the grid mounts only the cards near the viewport. */
  const gridKeysRef = useRef<string[]>([]);

  /** Keys of the selectable items on screen, in display order. */
  const renderedKeys = useCallback(() => {
    const keys: string[] = [];
    let gridAdded = false;
    pageRef.current?.querySelectorAll<HTMLElement>('.memex-stream-body [data-item-key]').forEach((el) => {
      if (el.closest('.memex-masonry')) {
        // Every card in the grid, mounted or not, in place of the mounted few
        if (!gridAdded) keys.push(...gridKeysRef.current);
        gridAdded = true;
      } else keys.push(el.dataset.itemKey as string);
    });
    return keys.filter((key) => !key.includes(':temp-'));
  }, []);

  const handleBulkDelete = useCallback(() => {
    const items = selectedItemKeys
      .map((key) => itemsByKey.get(key))
      .filter((item): item is StreamItem => !!item && !isPendingItem(item));
    if (items.length === 0) return;
    if (items.some((item) => item.type === 'note' && item.id === openNoteId)) closeNote();
    if (items.some((item) => item.type === 'link' && item.id === expandedLinkId)) setExpandedLinkId(null);
    const entries = items.map((item) => ({
      key: item.key,
      commit:
        item.type === 'link'
          ? () => deleteLink.mutate(item.id)
          : item.type === 'note'
            ? () => deleteNote.mutate(item.id)
            : () => deleteTask.mutate(item.id),
    }));
    const label =
      items.length === 1
        ? `Deleted “${items[0].type === 'link' ? getLinkTitle(items[0].link) : items[0].type === 'note' ? noteDisplayTitle(items[0].note) : items[0].task.title}”.`
        : `Deleted ${items.length} items.`;
    exitSelection();
    scheduleDeletes(entries, label);
  }, [
    closeNote,
    deleteLink,
    deleteNote,
    deleteTask,
    exitSelection,
    expandedLinkId,
    itemsByKey,
    openNoteId,
    scheduleDeletes,
    selectedItemKeys,
    setExpandedLinkId,
  ]);

  // Esc leaves selection mode; ⌘/Ctrl A selects everything on screen
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing =
        !!target &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if (editing || openNoteId || document.querySelector('dialog[open]')) return;
      if (event.key === 'Escape' && selectionMode) {
        event.preventDefault();
        exitSelection();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
        const keys = renderedKeys();
        if (keys.length === 0) return;
        event.preventDefault();
        setExpandedLinkId(null);
        setSelectionMode(true);
        setItemSelection(keys);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    exitSelection,
    openNoteId,
    renderedKeys,
    selectionMode,
    setExpandedLinkId,
    setItemSelection,
    setSelectionMode,
  ]);

  // Modifier clicks on any card or row: ⌘/Ctrl toggles (and starts selecting),
  // Shift selects the range from the last item clicked. Plain clicks in
  // selection mode fall through to the card's own toggle and set the anchor.
  useEffect(() => {
    const body = pageRef.current;
    if (!body) return;
    const keyFor = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const el = target.closest<HTMLElement>('[data-item-key]');
      if (!el || !el.closest('.memex-stream-body')) return null;
      // Links and controls inside a card keep their own behaviour
      // (⌘-click on the open-link button still opens a new tab)
      const control = target.closest('a, button, input, textarea');
      if (control && control !== el && el.contains(control)) return null;
      const key = el.dataset.itemKey as string;
      return key.includes(':temp-') ? null : key;
    };
    const onMouseDown = (event: MouseEvent) => {
      // Keep Shift/⌘ clicks from selecting text across cards
      if ((event.shiftKey || event.metaKey || event.ctrlKey) && keyFor(event)) event.preventDefault();
    };
    const onClick = (event: MouseEvent) => {
      const key = keyFor(event);
      if (!key) return;
      const state = useAppStore.getState();
      if (event.shiftKey && (state.selectionMode || selectionAnchorRef.current)) {
        event.preventDefault();
        event.stopPropagation();
        const order = renderedKeys();
        const from = order.indexOf(selectionAnchorRef.current ?? key);
        const to = order.indexOf(key);
        const range = from === -1 ? [key] : order.slice(Math.min(from, to), Math.max(from, to) + 1);
        if (!state.selectionMode) setSelectionMode(true);
        setItemSelection([...state.selectedItemKeys, ...range]);
        selectionAnchorRef.current = key;
        return;
      }
      if (event.metaKey || event.ctrlKey || event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        if (!state.selectionMode) {
          setExpandedLinkId(null);
          setSelectionMode(true);
        }
        toggleItemSelection(key);
        selectionAnchorRef.current = key;
        return;
      }
      if (state.selectionMode) selectionAnchorRef.current = key;
    };
    body.addEventListener('mousedown', onMouseDown, true);
    body.addEventListener('click', onClick, true);
    return () => {
      body.removeEventListener('mousedown', onMouseDown, true);
      body.removeEventListener('click', onClick, true);
    };
  }, [renderedKeys, setExpandedLinkId, setItemSelection, setSelectionMode, toggleItemSelection]);

  const markPreviewBroken = useCallback((linkId: string) => {
    setBrokenPreviews((prev) => (prev.has(linkId) ? prev : new Set(prev).add(linkId)));
  }, []);

  /* ---------- Open note (in-stack editor) ---------- */

  const openNoteItem = useMemo(() => {
    if (!openNoteId) return undefined;
    const item = itemsByKey.get(itemKey('note', openNoteId));
    return item?.type === 'note' ? item.note : undefined;
  }, [itemsByKey, openNoteId]);

  // A stale ?note= (deleted note) is dropped once notes have loaded
  useEffect(() => {
    if (openNoteId && allNotes && !openNoteItem) closeNote();
  }, [allNotes, closeNote, openNoteId, openNoteItem]);

  /* ---------- Saved views (15A tabs) ---------- */

  const { data: savedViewRows } = useSavedViews();
  const createSavedView = useCreateSavedView(HANDLES_ERRORS);
  const updateSavedView = useUpdateSavedView(HANDLES_ERRORS);
  const deleteSavedView = useDeleteSavedView();
  const [hiddenViewIds, setHiddenViewIds] = useState<Set<string>>(() => new Set());
  const pendingViewDeletes = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; commit: () => void }>());

  useEffect(() => {
    const pending = pendingViewDeletes.current;
    return () => {
      pending.forEach(({ timer, commit }) => {
        clearTimeout(timer);
        commit();
      });
      pending.clear();
    };
  }, []);

  const libraryViews = useMemo<LibraryView[]>(
    () => [
      ...BUILT_IN_VIEWS,
      ...savedViewsToTabs((savedViewRows ?? []).filter((row) => !hiddenViewIds.has(row.id))),
    ],
    [hiddenViewIds, savedViewRows],
  );

  const activeView = useMemo(() => findActiveView(activeFilters, libraryViews), [activeFilters, libraryViews]);

  /** A view's link: its filters, plus its sort and layout when it carries them. */
  const viewHref = useCallback(
    (target: LibraryView) => {
      const params = new URLSearchParams();
      const values = formatLibraryFilters(target.definition.filters);
      (Object.keys(FILTER_PARAM_NAMES) as (keyof typeof FILTER_PARAM_NAMES)[]).forEach((key) => {
        const value = values[key];
        if (value) params.set(FILTER_PARAM_NAMES[key], value);
      });
      const nextSortValue = formatSort(target.definition.sort ?? sort);
      if (nextSortValue) params.set(SORT_PARAM, nextSortValue);
      const layout = target.definition.layout ?? (viewParam && isStreamView(viewParam) ? viewParam : null);
      if (layout) params.set(VIEW_PARAM, layout);
      const query = params.toString();
      return `${LIBRARY_PATH}${query ? `?${query}` : ''}`;
    },
    [sort, viewParam],
  );

  const viewTabs = useMemo<ViewPanelTab[]>(() => {
    const context = { spacesOf };
    const known = {
      spaceIds: new Set((profiles ?? []).map((p) => p.id)),
      tagIds: new Set((tags ?? []).map((t) => t.id)),
    };
    return libraryViews
      .map((candidate) => ({
        view: candidate,
        count: countMatching(allItems, sanitizeFilters(candidate.definition.filters, known), context),
        href: viewHref(candidate),
      }))
      .filter((tab) => !isHideableWhenEmpty(tab.view) || tab.count > 0 || tab.view.id === activeView?.id);
  }, [activeView, allItems, libraryViews, profiles, spacesOf, tags, viewHref]);

  // Selection survives switching views, like any other filter change
  const handleOpenView = useCallback((target: LibraryView) => {
    if (target.definition.layout) storeView(target.definition.layout);
  }, []);

  const suggestedViewName = useMemo(
    () =>
      uniqueViewName(
        suggestViewName(activeFilters, {
          space: (id) => spaceById.get(id)?.name,
          tag: (id) => (tags ?? []).find((t) => t.id === id)?.name,
        }),
        libraryViews.map((v) => v.name),
      ),
    [activeFilters, libraryViews, spaceById, tags],
  );

  const handleSaveView = useCallback(
    async (name: string) => {
      try {
        await createSavedView.mutateAsync({
          name,
          definition: serializeViewDefinition({ filters: activeFilters, sort, layout: view }),
          position: nextViewPosition(savedViewRows ?? []),
        });
        cue('confirm');
        flash(`Saved view “${name}”.`);
      } catch (error) {
        console.error('Failed to save view:', error);
        cue('error');
        flash('Couldn’t save that view.');
        throw error;
      }
    },
    [activeFilters, createSavedView, flash, savedViewRows, sort, view],
  );

  const handleRenameView = useCallback(
    (target: LibraryView, name: string) => {
      updateSavedView.mutate(
        { id: target.id, updates: { name } },
        {
          onError: () => {
            cue('error');
            flash('Couldn’t rename that view.');
          },
        },
      );
    },
    [flash, updateSavedView],
  );

  const canUpdateView = Boolean(activeView && !activeView.builtIn && viewDiffers(activeView, { sort, layout: view }));

  const handleUpdateView = useCallback(
    (target: LibraryView) => {
      cue('confirm');
      updateSavedView.mutate(
        {
          id: target.id,
          updates: { definition: serializeViewDefinition({ filters: target.definition.filters, sort, layout: view }) },
        },
        {
          onSuccess: () => flash(`Saved this layout and sort to “${target.name}”.`),
          onError: () => {
            cue('error');
            flash('Couldn’t update that view.');
          },
        },
      );
    },
    [flash, sort, updateSavedView, view],
  );

  // Gone at once; the row is deleted after the Undo window
  const handleDeleteView = useCallback(
    (target: LibraryView) => {
      cue('dismiss');
      const unhide = () =>
        setHiddenViewIds((prev) => {
          const next = new Set(prev);
          next.delete(target.id);
          return next;
        });
      setHiddenViewIds((prev) => new Set(prev).add(target.id));
      const commit = () => deleteSavedView.mutate(target.id, { onSettled: unhide });
      const timer = setTimeout(() => {
        pendingViewDeletes.current.delete(target.id);
        commit();
      }, UNDO_WINDOW_MS);
      pendingViewDeletes.current.set(target.id, { timer, commit });
      flash(`Deleted view “${target.name}”.`, {
        label: 'Undo',
        onClick: () => {
          const entry = pendingViewDeletes.current.get(target.id);
          if (!entry) return;
          clearTimeout(entry.timer);
          pendingViewDeletes.current.delete(target.id);
          unhide();
          cue('confirm');
          dismissToast();
        },
      });
    },
    [deleteSavedView, dismissToast, flash],
  );
  const activeSpaceFilter = activeFilters.spaces;

  /* ---------- Copy ---------- */

  const hasActiveFilters =
    rawInput.length > 0 ||
    selectedTypes.length > 0 ||
    selectedSources.length > 0 ||
    activeSpaceFilter.length > 0 ||
    selectedTagIds.length > 0 ||
    includeUntagged;
  const typeLabel =
    selectedTypes.length === 1
      ? ITEM_TYPES.find((t) => t.key === selectedTypes[0])?.plural.toLowerCase() ?? 'items'
      : 'items';

  const emptyTitle = hasActiveFilters ? `No ${typeLabel} match` : 'Nothing here yet';
  const emptySubtitle = hasActiveFilters
    ? rawInput
      ? 'Other types may match — check the search results above, or press ⌘↵ to save what you typed.'
      : 'Try another type, or clear the filters.'
    : 'Paste a URL or type a thought above to capture it.';


  const selectedKeySet = useMemo(() => new Set(selectedItemKeys), [selectedItemKeys]);

  // Stable handlers for the memoized cards: a page re-render (a keystroke,
  // a toast) leaves every card on screen alone
  const activateLink = useStableCallback((link: LinkWithTag) => {
    const item = itemsByKey.get(itemKey('link', link.id));
    if (selectionMode) {
      if (item) handleToggleSelect(item);
    } else handleOpenLinkDetails(link);
  });
  const toggleSelectNote = useStableCallback((noteId: string) => {
    const item = itemsByKey.get(itemKey('note', noteId));
    if (item) handleToggleSelect(item);
  });
  const previewBroken = useStableCallback(markPreviewBroken);

  /** What the stream shows: a new value is a new query (scroll to top, crossfade). */
  const gridQueryKey = useMemo(
    () => JSON.stringify([activeFilters, gridSearch.trim().toLowerCase(), sort]),
    [activeFilters, gridSearch, sort],
  );

  // A new set of results fades in over the old (opacity only, ≤300ms) rather
  // than snapping; the old results stay up until the new ones are ready
  const streamBodyRef = useRef<HTMLDivElement>(null);
  // The sticky bar (StickyBar) slides in once the space pills scroll away
  const pillsRef = useRef<HTMLDivElement | null>(null);
  const shownQueryKey = useRef(gridQueryKey);
  useLayoutEffect(() => {
    if (shownQueryKey.current === gridQueryKey) return;
    shownQueryKey.current = gridQueryKey;
    const body = streamBodyRef.current;
    if (!body) return;
    if (view !== 'grid') body.scrollTop = 0; // the grid keeps its own scroll memory
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    body.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 220, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
  }, [gridQueryKey, view]);

  /** Whether a link card is image-first (a preview that hasn't failed). */
  const previewUrlOf = useCallback(
    (item: StreamItem | undefined) =>
      item?.type === 'link' && item.link.preview_image_url && !brokenPreviews.has(item.id)
        ? item.link.preview_image_url
        : null,
    [brokenPreviews],
  );

  const isCardPending = useCallback(
    (key: string) => {
      const url = previewUrlOf(itemsByKey.get(key));
      return Boolean(url) && getImageRatio(url) === undefined;
    },
    [itemsByKey, previewUrlOf],
  );

  const prefetchCards = useCallback(
    (keys: string[]) => {
      const urls: string[] = [];
      for (const key of keys) {
        const url = previewUrlOf(itemsByKey.get(key));
        if (url) urls.push(url);
      }
      prefetchImageRatios(urls);
    },
    [itemsByKey, previewUrlOf],
  );

  const renderRow = (item: StreamItem) => {
    const isSelected = selectedItemKeys.includes(item.key);
    if (item.type === 'link') {
      const link = item.link;
      const isExpanded = expandedLinkId === item.id;
      return (
        <div key={item.key} className={`memex-row-wrap${isExpanded ? ' is-expanded' : ''}`}>
          <StreamRow
            itemKey={item.key}
            leading={
              link.favicon_url ? (
                <img src={link.favicon_url} alt="" />
              ) : (
                <LinkIcon aria-hidden="true" />
              )
            }
            title={getLinkTitle(link)}
            meta={
              <>
                <span translate="no">{getHostname(link.url)}</span>
                <span aria-hidden="true"> · </span>
                {relativeTime(item.updatedAt)}
              </>
            }
            thumbnail={brokenPreviews.has(link.id) ? null : link.preview_image_url}
            onActivate={() =>
              selectionMode ? handleToggleSelect(item) : handleOpenLinkDetails(link)
            }
            selectionMode={selectionMode}
            isSelected={isSelected}
            isNew={link.id.startsWith('temp-')}
            ariaLabel={
              selectionMode ? `Select ${getLinkTitle(link)}` : `Details for ${getLinkTitle(link)}`
            }
            actions={
              <a
                className="memex-icon-button"
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleBackgroundLinkClick}
                aria-label={`Open ${getLinkTitle(link)} in a new tab`}
                title="Open link"
              >
                <ExternalLink aria-hidden="true" />
              </a>
            }
          />
        </div>
      );
    }
    if (item.type === 'note') {
      const note = item.note;
      const excerpt = markdownExcerpt(note.body, 140);
      return (
        <StreamRow
          itemKey={item.key}
          key={item.key}
          leading={<StickyNote aria-hidden="true" />}
          title={noteDisplayTitle(note)}
          meta={
            <>
              {relativeTime(item.updatedAt)}
              {excerpt && <span className="memex-row-excerpt"> · {excerpt}</span>}
            </>
          }
          onActivate={() => (selectionMode ? handleToggleSelect(item) : handleOpenNote(note))}
          selectionMode={selectionMode}
          isSelected={isSelected}
          isNew={note.id.startsWith('temp-')}
          actions={
            <button
              type="button"
              className="memex-icon-button"
              onClick={() => handleDeleteNote(note.id)}
              aria-label={`Delete “${noteDisplayTitle(note)}”`}
              title="Delete note"
            >
              <X aria-hidden="true" />
            </button>
          }
        />
      );
    }
    const task = item.task;
    return (
      <StreamRow
        itemKey={item.key}
        key={item.key}
        leading={
          <button
            type="button"
            role="checkbox"
            aria-checked={task.is_done}
            className="memex-task-check"
            onClick={() => handleToggleTaskDone(task)}
            aria-label={task.is_done ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`}
          >
            <Check aria-hidden="true" />
          </button>
        }
        title={task.title}
        meta={task.due_date ? `Due ${relativeTime(dueDateIso(task.due_date))}` : relativeTime(item.updatedAt)}
        onActivate={selectionMode ? () => handleToggleSelect(item) : undefined}
        selectionMode={selectionMode}
        isSelected={isSelected}
        isNew={task.id.startsWith('temp-')}
        actions={
          <button
            type="button"
            className="memex-icon-button"
            onClick={() => handleDeleteTask(task.id)}
            aria-label={`Delete “${task.title}”`}
            title="Delete task"
          >
            <X aria-hidden="true" />
          </button>
        }
      />
    );
  };

  // Date sorts keep the Today / This week… groups (oldest first flips them);
  // any other sort is one list under its own name
  const listGroups = useMemo(() => {
    const groupDate = groupDateFor(sort);
    if (!groupDate) return openItems.length ? [{ label: sortLabel(sort), items: openItems }] : [];
    const groups = groupByTime(openItems, groupDate);
    return sort.direction === 'asc' ? groups.reverse() : groups;
  }, [openItems, sort]);

  /* ---------- Table ---------- */

  const columns = useMemo(() => tableColumns({ showTags: SHOW_TAGS_UI }), []);

  const tableSpacesOf = useCallback(
    (key: string): TableSpace[] =>
      spacesOf(key)
        .map((id) => spaceById.get(id))
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
        .map((p) => ({ id: p.id, name: p.name, color: spaceColors.get(p.id) })),
    [spaceById, spaceColors, spacesOf],
  );

  const handleTableToggleSelect = useCallback(
    (item: StreamItem) => {
      if (isPendingItem(item)) return;
      if (!useAppStore.getState().selectionMode) {
        setExpandedLinkId(null);
        setSelectionMode(true);
      }
      selectionAnchorRef.current = item.key;
      toggleItemSelection(item.key);
    },
    [setExpandedLinkId, setSelectionMode, toggleItemSelection],
  );

  const handleTableSelectAll = useCallback(
    (keys: string[]) => {
      setExpandedLinkId(null);
      setSelectionMode(true);
      setItemSelection(Array.from(new Set([...useAppStore.getState().selectedItemKeys, ...keys])));
    },
    [setExpandedLinkId, setItemSelection, setSelectionMode],
  );

  const handleTableClearSelection = useCallback(() => {
    const visible = new Set(filteredItems.map((item) => item.key));
    setItemSelection(useAppStore.getState().selectedItemKeys.filter((key) => !visible.has(key)));
  }, [filteredItems, setItemSelection]);

  const handleTableDelete = useCallback(
    (item: StreamItem) => {
      if (item.type === 'link') handleDeleteLink(item.link);
      else if (item.type === 'note') handleDeleteNote(item.id);
      else handleDeleteTask(item.id);
    },
    [handleDeleteLink, handleDeleteNote, handleDeleteTask],
  );

  const nothingToShow = openItems.length === 0 && doneTasks.length === 0;

  /* ---------- The Cards page (Memory Cards, design/memory-cards) ---------- */

  // One space chosen → its pill fills, the hero names it, captures file there
  const mcSpaceId = captureSpaceId;
  const { labelFor } = useCardLabels(mcSpaceId);
  const { data: allJots } = useAllSelfMessages();
  const [captureText, setCaptureText] = useState<string | null>(null);
  const [viewPanelOpen, setViewPanelOpen] = useState(false);
  const [moveKeys, setMoveKeys] = useState<string[] | null>(null);
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
  const viewButtonRef = useRef<HTMLButtonElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);

  // Jots join the grid only in the plain, date-ordered view (cardsGrid.ts)
  const mcJots = useMemo(() => {
    if (!allJots) return [];
    const eligible = gridShowsJots({
      types: selectedTypes,
      sources: selectedSources,
      tagIds: selectedTagIds,
      untagged: includeUntagged,
      sortField: sort.field,
      sortDirection: sort.direction,
    });
    if (!eligible) return [];
    return allJots
      .filter((jot) => !hiddenJotIds.has(jot.id) && jotMatches(jot, activeFilters.spaces, gridSearch, UNFILED))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [
    activeFilters.spaces,
    allJots,
    gridSearch,
    hiddenJotIds,
    includeUntagged,
    selectedSources,
    selectedTagIds,
    selectedTypes,
    sort.direction,
    sort.field,
  ]);
  const mcJotsById = useMemo(() => new Map(mcJots.map((jot) => [jot.id, jot])), [mcJots]);

  // Tasks are cards in the grid (the task band is gone); done ones stay in Tasks
  const mcGridKeys = useMemo(() => {
    const items = openItems.map((item) => ({
      key: item.key,
      at: sort.field === 'saved' ? itemCreatedAt(item) : item.updatedAt,
    }));
    if (mcJots.length === 0) return items.map((item) => item.key);
    return interleaveNewestFirst(
      items,
      mcJots.map((jot) => ({ key: `jot:${jot.id}`, at: jot.created_at })),
    );
  }, [mcJots, openItems, sort.field]);

  const mcMasonryItems = useMemo<MasonryItem[]>(() => mcGridKeys.map((key) => ({ key })), [mcGridKeys]);

  useLayoutEffect(() => {
    gridKeysRef.current = mcGridKeys;
  }, [mcGridKeys]);

  const mcEstimate = useCallback(
    (key: string, width: number) => {
      if (key.startsWith('jot:')) return jotCardHeight(width, mcJotsById.get(key.slice(4))?.body.length ?? 40);
      const item = itemsByKey.get(key);
      if (!item) return 0;
      if (item.type === 'task') return taskCardHeight(width, item.task.title.length, Boolean(item.task.due_date));
      if (item.type === 'note') {
        return noteCardHeight(width, noteDisplayTitle(item.note).length, Math.min(220, noteExcerptLength(item.note)));
      }
      const url = previewUrlOf(item);
      const titleLength = getLinkTitle(item.link).length;
      if (url) return pictureCardHeight(width, layoutRatio(url, item.link.url, item.link.source), titleLength);
      return linkCardHeight(width, titleLength);
    },
    [itemsByKey, mcJotsById, previewUrlOf],
  );

  const mcSizeToken = useCallback(
    (key: string) => {
      if (key.startsWith('jot:')) return `mc|j|${mcJotsById.get(key.slice(4))?.updated_at ?? ''}`;
      const item = itemsByKey.get(key);
      if (!item) return 'mc|';
      const label = labelFor(key);
      const labelToken = `${label.name ?? ''}+${label.extra}`;
      if (item.type === 'task') return `mc|t|${item.task.updated_at}|${labelToken}`;
      if (item.type === 'note') return `mc|n|${item.note.updated_at}|${labelToken}`;
      const url = previewUrlOf(item);
      if (!url) return `mc|l|${item.link.updated_at}|${labelToken}`;
      return `mc|p|${item.link.updated_at}|${getShownRatio(url) ?? getImageRatio(url) ?? '?'}|${labelToken}`;
    },
    [itemsByKey, labelFor, mcJotsById, previewUrlOf],
  );

  const toggleTaskCard = useStableCallback(handleToggleTaskDone);
  const toggleSelectTask = useStableCallback((task: TaskWithTags) => {
    const item = itemsByKey.get(itemKey('task', task.id));
    if (item) handleToggleSelect(item);
  });
  const openJotCard = useStableCallback((jot: SelfMessage) => {
    if (selectionMode) toggleItemSelection(`jot:${jot.id}`);
    else navigate(`${JOURNAL_PATH}?jot=${jot.id}`);
  });
  const activateNoteCard = useStableCallback((note: NoteWithTags) => {
    if (selectionMode) toggleSelectNote(note.id);
    else handleOpenNote(note);
  });

  const renderMemoryCard = (key: string) => {
    const isSelected = selectedKeySet.has(key);
    const label = labelFor(key);
    if (key.startsWith('jot:')) {
      const jot = mcJotsById.get(key.slice(4));
      return jot ? (
        <JotMemoryCard jot={jot} label={label} onActivate={openJotCard} selected={isSelected} selectionMode={selectionMode} />
      ) : null;
    }
    const item = itemsByKey.get(key);
    if (!item) return null;
    if (item.type === 'link') {
      return (
        <LinkMemoryCard
          link={item.link}
          label={label}
          withPicture={Boolean(item.link.preview_image_url) && !brokenPreviews.has(item.id)}
          onActivate={activateLink}
          onImageError={previewBroken}
          selected={isSelected}
          selectionMode={selectionMode}
          pinned={pinsApi.isPinned(item.link.id)}
        />
      );
    }
    if (item.type === 'note') {
      return (
        <NoteMemoryCard note={item.note} label={label} onActivate={activateNoteCard} selected={isSelected} selectionMode={selectionMode} />
      );
    }
    return (
      <TaskMemoryCard
        task={item.task}
        label={label}
        onToggleDone={toggleTaskCard}
        onActivate={selectionMode ? toggleSelectTask : undefined}
        selected={isSelected}
        selectionMode={selectionMode}
      />
    );
  };

  /** Where a space pill goes: this page with only that space chosen (other filters kept). */
  const spaceHref = useCallback(
    (spaceId: string | null) => {
      const params = new URLSearchParams(searchParams);
      params.delete(NOTE_PARAM);
      params.delete(LINK_PARAM);
      if (spaceId) params.set(SPACE_PARAM, spaceId);
      else params.delete(SPACE_PARAM);
      const query = params.toString();
      return `${LIBRARY_PATH}${query ? `?${query}` : ''}`;
    },
    [searchParams],
  );

  const resetView = useCallback(() => {
    updateParams((params) => {
      [TYPE_PARAM, SOURCE_PARAM, SORT_PARAM, TAGS_PARAM, UNTAGGED_PARAM, VIEW_PARAM].forEach((key) => params.delete(key));
      if (activeFilters.spaces.includes(UNFILED)) params.delete(SPACE_PARAM);
    });
    storeView('grid');
  }, [activeFilters.spaces, updateParams]);

  const unfiledOnly = activeFilters.spaces.length === 1 && activeFilters.spaces[0] === UNFILED;
  const mcViewCustomised =
    selectedTypes.length > 0 || selectedSources.length > 0 || unfiledOnly || !sameSort(sort, SORT_OPTIONS[0]) || view !== 'grid';

  // “/” puts the cursor in the save/search field
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]') || document.querySelector('dialog[open]')) return;
      event.preventDefault();
      fieldRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const mcSpace = mcSpaceId ? spaceById.get(mcSpaceId) : undefined;
  const mcHeroName =
    activeView && activeView.id !== 'everything' ? activeView.name : mcSpace ? mcSpace.name : 'Everything';
  const mcShownCount = view === 'grid' ? mcGridKeys.length : filteredItems.length;
  const openLinkItem = expandedLinkId ? itemsByKey.get(itemKey('link', expandedLinkId)) : undefined;
  const openLink = openLinkItem?.type === 'link' ? openLinkItem.link : null;

  const renderCardsPage = () => {
    const emptyLibrary = loadState === 'ready' && allItems.length === 0 && (allJots?.length ?? 0) === 0;
    let body: ReactNode;
    if (loadState === 'failed') {
      body = (
        <EmptySlot
          color="var(--mc-coral)"
          glyph={<AlertTriangle />}
          title="Your cards didn’t load"
          body="Check your connection, then try again. Nothing you saved is lost."
          action={
            <button type="button" className="mc-btn is-primary" onClick={() => void refetchLibrary()}>
              Try again
            </button>
          }
        />
      );
    } else if (itemsPending && nothingToShow) {
      body = <CardsSkeleton />;
    } else if (emptyLibrary) {
      body = (
        <EmptySlot
          color="var(--mc-blue)"
          glyph={<Plus />}
          title="Your first card goes here"
          body="Paste a link or write a thought in the field above, then press Enter."
          action={
            <button type="button" className="mc-btn is-primary" onClick={() => setCaptureText(searchQuery)}>
              Save something
            </button>
          }
        />
      );
    } else if ((view === 'grid' ? mcGridKeys.length === 0 : filteredItems.length === 0)) {
      body = (
        <EmptySlot
          glyph={<Search />}
          title={gridSearch.trim() ? `Nothing matches “${gridSearch.trim()}”` : hasActiveFilters ? emptyTitle : 'All clear'}
          body={
            gridSearch.trim()
              ? 'Press Enter to save it as a card instead.'
              : hasActiveFilters
                ? emptySubtitle
                : 'Nothing open. Everything left is done.'
          }
          action={
            gridSearch.trim() ? (
              <button type="button" className="mc-btn is-quiet" onClick={() => setSearchQuery('')}>
                Clear search
              </button>
            ) : hasActiveFilters ? (
              <RouterLink className="mc-btn is-quiet" to={LIBRARY_PATH}>
                Show everything
              </RouterLink>
            ) : undefined
          }
        />
      );
    } else if (view === 'table') {
      body = (
        <div className="mc-table-wrap">
          <LibraryTable
            items={filteredItems}
            columns={columns}
            sort={sort}
            onSort={sortBy}
            spacesOf={tableSpacesOf}
            selectionMode={selectionMode}
            selectedKeys={selectedKeySet}
            onToggleSelect={handleTableToggleSelect}
            onSelectAll={handleTableSelectAll}
            onClearSelection={handleTableClearSelection}
            expandedLinkId={null}
            renderExpanded={() => null}
            onOpenLinkDetails={handleOpenLinkDetails}
            onOpenUrl={handleOpenLink}
            onOpenNote={handleOpenNote}
            onToggleTaskDone={handleToggleTaskDone}
            onDelete={handleTableDelete}
            brokenPreviews={brokenPreviews}
            onPreviewError={markPreviewBroken}
          />
        </div>
      );
    } else if (view === 'list') {
      body = (
        <div className="memex-list mc-list">
          {listGroups.map((group) => (
            <section key={group.label} className="memex-list-group" aria-label={group.label}>
              <h2 className="memex-list-label">
                {group.label}
                <span className="memex-list-count">{group.items.length}</span>
              </h2>
              <div className="memex-list-rows">{group.items.map(renderRow)}</div>
            </section>
          ))}
        </div>
      );
    } else {
      body = (
        <MasonryLayout
          className="mc-grid"
          items={mcMasonryItems}
          renderItem={renderMemoryCard}
          estimateHeight={mcEstimate}
          sizeToken={mcSizeToken}
          isPending={isCardPending}
          subscribeEstimates={subscribeImageRatios}
          onPrefetch={prefetchCards}
          scrollKey={`mc|${gridQueryKey}`}
          restoreOnKeyChange={navigationType === 'POP'}
          minColumnWidth={340}
        />
      );
    }

    return (
      <div ref={pageRef} className={`mc-page mc-cards-page${selectionMode ? ' has-selection-bar' : ''}`}>
        {openNoteItem ? (
          <NoteEditor
            note={openNoteItem}
            backLabel={mcHeroName}
            onBack={closeNote}
            onSave={handleSaveNote}
            onDelete={handleDeleteNote}
          />
        ) : (
          <>
            <StickyBar
              watch={pillsRef}
              title={mcHeroName}
              count={loadState === 'ready' ? mcShownCount : undefined}
              pills={
                <SpacePillRow
                  compact
                  spaces={profiles}
                  colors={spaceColors}
                  selectedId={mcSpaceId}
                  allOn={activeFilters.spaces.length === 0}
                  hrefFor={spaceHref}
                  onAdd={(spaceId, keys) => addToSpace(spaceId, keys)}
                />
              }
            />
            <div className="mc-page-head">
              <h1 className="mc-hero" tabIndex={-1}>
                <span translate={mcSpace ? 'no' : undefined}>{mcHeroName}</span>
                {loadState === 'ready' && <sup aria-label={`${mcShownCount} cards`}>{numberFormat.format(mcShownCount)}</sup>}
              </h1>
              <div className="mc-page-tools">
                <form
                  className="mc-field"
                  role="search"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setCaptureText(searchQuery);
                  }}
                >
                  <span className="mc-field-glyph" aria-hidden="true">
                    <Search />
                  </span>
                  <label className="mc-sr-only" htmlFor="mc-cards-field">
                    Search or save
                  </label>
                  <input
                    id="mc-cards-field"
                    ref={fieldRef}
                    type="text"
                    enterKeyHint="go"
                    autoComplete="off"
                    placeholder="Search or save a link, a thought…"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape' && searchQuery) {
                        event.preventDefault();
                        setSearchQuery('');
                      }
                    }}
                    aria-describedby="mc-cards-field-hint"
                  />
                  <span id="mc-cards-field-hint" className="mc-sr-only">
                    Typing filters your cards. Enter saves what you typed as a new card.
                  </span>
                  {searchQuery.trim() ? (
                    <kbd className="mc-kb" aria-hidden="true">
                      ↵ save
                    </kbd>
                  ) : (
                    <kbd className="mc-kb" aria-hidden="true">
                      /
                    </kbd>
                  )}
                  <button type="submit" className="mc-plus" aria-label="Save something">
                    <Plus aria-hidden="true" />
                  </button>
                </form>
                <button
                  ref={viewButtonRef}
                  type="button"
                  className="mc-rb"
                  aria-label="View options"
                  aria-haspopup="dialog"
                  aria-expanded={viewPanelOpen}
                  onClick={() => setViewPanelOpen((open) => !open)}
                >
                  <MoreHorizontal aria-hidden="true" />
                  {mcViewCustomised && <span className="mc-dot-badge" aria-hidden="true" />}
                </button>
                <ViewPanel
                  open={viewPanelOpen}
                  onClose={() => setViewPanelOpen(false)}
                  anchor={viewButtonRef.current}
                  layout={view}
                  onLayout={(next) => setView(next)}
                  types={selectedTypes}
                  onToggleType={(type) =>
                    updateParams((params) => setListParam(params, TYPE_PARAM, toggleShownType(MC_TYPE_KEYS, selectedTypes, type)))
                  }
                  unfiledOnly={unfiledOnly}
                  onToggleUnfiled={() =>
                    updateParams((params) => {
                      if (unfiledOnly) params.delete(SPACE_PARAM);
                      else params.set(SPACE_PARAM, UNFILED);
                    })
                  }
                  sources={selectedSources}
                  onToggleSource={(key) => toggleListValue(SOURCE_PARAM, selectedSources, key)}
                  sort={sort}
                  onSort={setSort}
                  tabs={viewTabs}
                  activeViewId={activeView?.id ?? null}
                  onOpenView={handleOpenView}
                  canSave={!activeView}
                  suggestedName={suggestedViewName}
                  onSave={handleSaveView}
                  canUpdate={canUpdateView}
                  onUpdate={handleUpdateView}
                  onRename={handleRenameView}
                  onDelete={handleDeleteView}
                  onReset={resetView}
                  canReset={mcViewCustomised}
                  footer={
                    <>
                      <button
                        type="button"
                        className="mc-btn is-small"
                        onClick={() => {
                          setViewPanelOpen(false);
                          if (selectionMode) exitSelection();
                          else handleToggleSelectionMode();
                        }}
                      >
                        {selectionMode ? 'Stop selecting' : 'Select cards'}
                      </button>
                      {mcSpace && (
                        <RouterLink className="mc-btn is-small" to={spacePath(mcSpace.id)}>
                          Open {mcSpace.name}’s page
                        </RouterLink>
                      )}
                    </>
                  }
                />
              </div>
            </div>

            <div ref={pillsRef}>
              <SpacePillRow
                spaces={profiles}
                colors={spaceColors}
                selectedId={mcSpaceId}
                allOn={activeFilters.spaces.length === 0}
                hrefFor={spaceHref}
                onAdd={(spaceId, keys) => addToSpace(spaceId, keys)}
                onNewSpace={() => setNewSpaceOpen(true)}
              />
            </div>

            <div key={view} ref={streamBodyRef} className={`memex-stream-body mc-stream is-${view}`}>
              {body}
            </div>
          </>
        )}

        <CaptureSheet
          open={captureText !== null}
          onClose={() => {
            setCaptureText(null);
            setSearchQuery('');
          }}
          initialText={captureText ?? ''}
          spaces={profiles ?? []}
          defaultSpaceId={mcSpaceId}
          onFeedback={flash}
        />
        <OpenCardSheet
          link={openLink}
          onClose={() => setExpandedLinkId(null)}
          isPinned={expandedIsPinned}
          pinSpaceName={pinScope.spaceName}
          onTogglePin={handleTogglePin}
          onOpen={() => openLink && handleOpenLink(openLink)}
          onRescrape={handleRescrape}
          onDelete={() => openLink && handleDeleteLink(openLink)}
          onMove={() => openLink && setMoveKeys([itemKey('link', openLink.id)])}
          onFeedback={flash}
        />
        <MoveSheet
          open={moveKeys !== null}
          onClose={() => setMoveKeys(null)}
          itemKeys={moveKeys ?? []}
          onFeedback={flash}
          title={moveKeys && moveKeys.length > 1 ? `Move ${moveKeys.length} cards to…` : 'Move to…'}
        />
        <NewSpaceSheet open={newSpaceOpen} onClose={() => setNewSpaceOpen(false)} onFeedback={flash} />

        {selectionMode && (
          <CardsSelectionBar
            count={selectedItemKeys.length}
            hiddenCount={hiddenSelectedCount}
            onMove={() => setMoveKeys([...selectedItemKeys])}
            onDelete={handleBulkDelete}
            onExit={exitSelection}
          />
        )}

        {toast !== null && (
          <FeedbackToast message={toast.message} phase={toast.phase} action={toast.action} onAnimationEnd={handleAnimationEnd} />
        )}
      </div>
    );
  };

  return renderCardsPage();
};

export default StreamPage;
