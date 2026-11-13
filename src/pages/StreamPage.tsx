import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigationType, useSearchParams } from 'react-router-dom';
import LibraryTable, { type TableSpace } from '../components/library/LibraryTable';
import LibraryViewTabs, { type ViewTab } from '../components/library/LibraryViewTabs';
import MenuButton, { type MenuEntry } from '../components/library/MenuButton';
import AppHeader from '../components/AppHeader';
import LinkGridCard from '../components/LinkGridCard';
import CommandBar, {
  type CommandCreateAction,
  type CommandResultGroup,
} from '../components/stream/CommandBar';
import LinkExpandedCard from '../components/stream/LinkExpandedCard';
import LinkPreviewCard from '../components/stream/LinkPreviewCard';
import MasonryLayout, { type MasonryItem } from '../components/stream/MasonryLayout';
import GridSkeleton from '../components/stream/GridSkeleton';
import StreamRow from '../components/stream/StreamRow';
import TaskBand from '../components/stream/TaskBand';
import SelectionBar from '../components/stream/SelectionBar';
import JournalPanel from '../components/stream/JournalPanel';
import NoteEditor from '../components/NoteEditor';
import NoteGridCard from '../components/NoteGridCard';
import StreamFilterBar from '../components/StreamFilterBar';
import { EmptyState, FeedbackToast, FrostedStack } from '../components/ui';
import {
  ITEM_TYPES,
  type ItemType,
  LinkWithTag,
  NoteWithTags,
  SelfMessage,
  TaskWithTags,
  UpdateNoteData,
  isUrlLike,
  normalizeUrlInput,
  getHostname,
  getLinkTitle,
  markdownExcerpt,
  noteDisplayTitle,
  dayKeyOf,
  dueDateIso,
  groupByTime,
  relativeTime,
  toDayKey,
  StreamItem,
  buildStreamItems,
  byUpdatedDesc,
  BUILT_IN_VIEWS,
  SORT_OPTIONS,
  SOURCE_KEYS,
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
  sourceKeyLabel,
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
  mergeTags,
  countByType,
  countTags,
  countUntagged,
  isDoneTask,
  matchesTagFilter,
  matchesTypeFilter,
  orderTagsForRow,
  pinnedLinks,
} from '@memex/core';
import {
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
import { useSession } from '../context/SessionContext';
import { useFeedbackToast } from '../hooks/useFeedbackToast';
import { useAddToSpace } from '../hooks/useAddToSpace';
import { useAllLinks, useCreateLink, useDeleteLink, useUpdateLink } from '../hooks/useLinks';
import { useSetLinkTags } from '../hooks/useLinkTags';
import { useAllNotes, useCreateNote, useDeleteNote, useUpdateNote } from '../hooks/useNotes';
import { useSetNoteTags } from '../hooks/useNoteTags';
import { useAddLinksToProfile, useProfileLinkMembership } from '../hooks/useProfileLinks';
import { useAddNotesToProfile, useProfileNoteMembership } from '../hooks/useProfileNotes';
import { useAddTasksToProfile, useProfileTaskMembership } from '../hooks/useProfileTasks';
import { useProfiles } from '../hooks/useProfiles';
import { useTags } from '../hooks/useTags';
import { useAllTasks, useCreateTask, useDeleteTask, useUpdateTask } from '../hooks/useTasks';
import { useDeleteSelfMessage, useSelfMessages } from '../hooks/useSelfMessages';
import { useCreateSavedView, useDeleteSavedView, useSavedViews, useUpdateSavedView } from '../hooks/useSavedViews';
import { useSetTaskTags } from '../hooks/useTaskTags';
import { urlScraperApi } from '../hooks/useUrlScraper';
import { useAppStore } from '../store';
import { handleBackgroundLinkClick, openUrlInBackgroundTab } from '../utils/openUrlInBackgroundTab';
import { cue } from '../utils/sound';
import { HANDLES_ERRORS } from '../utils/mutationErrors';
import { loadStateOf } from '../utils/loadState';
import LoadErrorState from '../components/LoadErrorState';
import { useSpaceColors } from '../hooks/useSpaceColors';
import { useStableCallback } from '../hooks/useStableCallback';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { getImageRatio, getShownRatio, layoutRatio, prefetchImageRatios, subscribeImageRatios } from '../utils/imageRatios';
import { estimatedLines, pictureHeight, textCardHeight } from '../utils/cardEstimates';
import type { RescrapeResult } from '../components/stream/LinkExpandedCard';
import {
  ArrowUpDown,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  LayoutGrid,
  Link as LinkIcon,
  Plus,
  Rows3,
  Square,
  StickyNote,
  Table2,
  X,
} from 'lucide-react';

/** Context captured when the omnibar creates an item, so the optimistic row
 * passes the active space/tag filters until the joins land. */
type PendingAdd = {
  kind: ItemType;
  rawInput: string;
  /** Normalized URL (links) or title (notes/tasks) used to spot the optimistic row. */
  match: string;
  spaceId: string | null;
  tagIds: string[];
};

const SELF_NOTES_OPEN_KEY = 'memex.self-notes-open';
const VIEW_STORAGE_KEY = 'memex.stream-view';
const UNDO_WINDOW_MS = 6000;
const PALETTE_RESULTS_PER_TYPE = 4;

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

const HAD_PINNED_KEY = 'memex.library.hadPinned';

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
 * The Library: a mixed stream of notes, links, and tasks — everything at
 * /library (a space's own page is SpacePage) — with element-type and tag
 * chips above the grid, omnibar capture, and the super favorites in the
 * header.
 */
const StreamPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = useSession();

  const [searchQuery, setSearchQuery] = useState('');
  // The input stays instant; the grid follows once typing pauses, rendered
  // at low priority so a keystroke never waits on it
  const gridSearch = useDeferredValue(useDebouncedValue(searchQuery, 120));
  // The palette under the input follows every keystroke, also at low priority
  const paletteSearch = useDeferredValue(searchQuery);
  const navigationType = useNavigationType();
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(() => new Set());
  const [brokenPreviews, setBrokenPreviews] = useState<Set<string>>(() => new Set());
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [selfNotesOpen, setSelfNotesOpen] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(SELF_NOTES_OPEN_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches,
  );

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

  // HANDLES_ERRORS: every use on this page reports its own failure (capture,
  // conversions, tagging, filing after a capture, the note editor's status,
  // the expanded link's status line). The rest (deletes, ticks) fall back to
  // the shell's toast.
  const createLink = useCreateLink(HANDLES_ERRORS);
  const updateLink = useUpdateLink(HANDLES_ERRORS);
  const deleteLink = useDeleteLink();
  const setLinkTags = useSetLinkTags(HANDLES_ERRORS);
  const addLinksToProfile = useAddLinksToProfile(HANDLES_ERRORS);
  const createNote = useCreateNote(HANDLES_ERRORS);
  const updateNote = useUpdateNote(HANDLES_ERRORS);
  const deleteNote = useDeleteNote();
  const setNoteTags = useSetNoteTags(HANDLES_ERRORS);
  const addNotesToProfile = useAddNotesToProfile(HANDLES_ERRORS);
  const createTask = useCreateTask(HANDLES_ERRORS);
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const setTaskTags = useSetTaskTags(HANDLES_ERRORS);
  const addTasksToProfile = useAddTasksToProfile(HANDLES_ERRORS);
  const deleteSelfMessage = useDeleteSelfMessage();
  const { messages: scopeJots } = useSelfMessages(null);
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
  const selectedSpaceFilter = urlFilters.spaces;
  const sortParam = searchParams.get(SORT_PARAM);
  const sort = useMemo(() => parseSort(sortParam), [sortParam]);
  const openNoteId = searchParams.get(NOTE_PARAM);
  const expandedLinkId = searchParams.get(LINK_PARAM);
  const todayKey = toDayKey(new Date());
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

  const toggleType = useCallback(
    (type: ItemType) =>
      updateParams((params) => {
        const next = selectedTypes.includes(type)
          ? selectedTypes.filter((t) => t !== type)
          : [...selectedTypes, type];
        setListParam(params, TYPE_PARAM, next);
      }),
    [selectedTypes, setListParam, updateParams],
  );

  const setSelectedTagIds = useCallback(
    (next: string[]) => updateParams((params) => setListParam(params, TAGS_PARAM, next)),
    [setListParam, updateParams],
  );

  const toggleUntagged = useCallback(
    () =>
      updateParams((params) => {
        if (includeUntagged) params.delete(UNTAGGED_PARAM);
        else params.set(UNTAGGED_PARAM, '1');
      }),
    [includeUntagged, updateParams],
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

  const clearParam = useCallback((key: string) => updateParams((params) => params.delete(key)), [updateParams]);

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

  /* ---------- Notes to Self panel ---------- */

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 899px)');
    const onChange = () => setIsNarrow(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const toggleSelfNotes = useCallback(() => {
    setSelfNotesOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SELF_NOTES_OPEN_KEY, next ? '1' : '0');
      } catch {
        /* storage unavailable — skip */
      }
      return next;
    });
  }, []);

  const closeSelfNotes = useCallback(() => {
    cue('dismiss');
    setSelfNotesOpen(false);
    try {
      window.localStorage.setItem(SELF_NOTES_OPEN_KEY, '0');
    } catch {
      /* storage unavailable — skip */
    }
  }, []);

  // "J" toggles the Journal from anywhere outside a text field
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'j' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      toggleSelfNotes();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSelfNotes]);

  // On phones the sheet is a whole page: flag the document so the bottom
  // bar hides while it is open (the bar is fixed at a higher stacking layer
  // than the stream, so it can't be overlapped — only removed)
  useEffect(() => {
    const open = selfNotesOpen && isNarrow;
    document.documentElement.classList.toggle('memex-sheet-open', open);
    return () => document.documentElement.classList.remove('memex-sheet-open');
  }, [isNarrow, selfNotesOpen]);

  // Escape closes the mobile sheet
  useEffect(() => {
    if (!selfNotesOpen || !isNarrow) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') closeSelfNotes();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeSelfNotes, isNarrow, selfNotesOpen]);

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

  const isPendingMatch = useCallback(
    (item: StreamItem) => {
      if (!pendingAdd || item.type !== pendingAdd.kind) return false;
      if (isPendingItem(item)) return true;
      if (item.type === 'link') return item.link.url === pendingAdd.match;
      if (item.type === 'note') return item.note.title === pendingAdd.match;
      return item.task.title === pendingAdd.match;
    },
    [pendingAdd],
  );

  const matchesType = useCallback(
    (item: StreamItem) => matchesTypeFilter(item.type, selectedTypes),
    [selectedTypes],
  );

  const matchesTags = useCallback(
    (item: StreamItem) => {
      if (selectedTagIds.length === 0 && !includeUntagged) return true;
      const tagIds = isPendingMatch(item)
        ? (pendingAdd?.tagIds ?? [])
        : item.tags.map((tag) => tag.id);
      return matchesTagFilter(tagIds, selectedTagIds, includeUntagged);
    },
    [includeUntagged, isPendingMatch, pendingAdd, selectedTagIds],
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
      const pending = isPendingMatch(item);
      return matchesLibraryFilters(
        item,
        { types: [], tagIds: [], untagged: false, sources: selectedSources, spaces: activeFilters.spaces },
        {
          // An optimistic capture counts as filed where it is being filed
          spacesOf: (key) => (pending ? (pendingAdd?.spaceId ? [pendingAdd.spaceId] : []) : spacesOf(key)),
        },
      );
    },
    [activeFilters.spaces, isPendingMatch, pendingAdd, selectedSources, spacesOf],
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

  // Type chip counts respect tag + search filters; tag chip counts respect
  // type + search filters — each row describes what the other would show.
  const typeCounts = useMemo(
    () => countByType(allItems.filter((item) => matchesPlace(item) && matchesTags(item) && matchesSearch(item))),
    [matchesPlace, matchesSearch, matchesTags, allItems],
  );

  // Unfiltered per-type totals for the current scope drive the chip order
  const typeTotals = useMemo(() => countByType(allItems), [allItems]);

  const itemsForTagRow = useMemo(
    () => allItems.filter((item) => matchesType(item) && matchesPlace(item) && matchesSearch(item)),
    [matchesPlace, matchesSearch, matchesType, allItems],
  );

  const tagCounts = useMemo(() => countTags(itemsForTagRow), [itemsForTagRow]);

  const untaggedCount = useMemo(() => countUntagged(itemsForTagRow), [itemsForTagRow]);

  const tagsForRow = useMemo(
    () => orderTagsForRow(tags ?? [], tagCounts, { inSpace: false, selectedTagIds }),
    [selectedTagIds, tagCounts, tags],
  );

  /* ---------- Super favorites (header) ---------- */

  const superFavoriteLinks = useMemo(
    () => pinnedLinks(allItems, linkMembership ?? [], undefined),
    [allItems, linkMembership],
  );

  // Whether the last visit had pinned sites: their row's height is held
  // while the Library loads, so the page doesn't drop when they arrive
  const [hadPinned] = useState(() => {
    try {
      return window.localStorage.getItem(HAD_PINNED_KEY) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (itemsPending) return;
    try {
      window.localStorage.setItem(HAD_PINNED_KEY, superFavoriteLinks.length > 0 ? '1' : '0');
    } catch {
      /* storage unavailable — skip */
    }
  }, [itemsPending, superFavoriteLinks.length]);

  /* ---------- Selection ---------- */

  const bulkAssignActive = selectionMode && selectedItemKeys.length > 0;

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

  // Leaving the stream (unmount) must not leave the sidebar in bulk mode
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

  const handleBulkAddTag = useCallback(
    async (tagId: string) => {
      const tag = (tags ?? []).find((t) => t.id === tagId);
      const tagName = tag?.name ?? 'tag';
      const targets = selectedItemKeys
        .map((key) => itemsByKey.get(key))
        .filter((item): item is StreamItem => !!item && !isPendingItem(item))
        .filter((item) => !item.tags.some((t) => t.id === tagId));

      if (targets.length === 0) {
        flash(`Selection already had “${tagName}”.`);
        return;
      }
      cue('move');

      // Count what landed: the toast says so only after the writes
      const results = await Promise.allSettled(
        targets.map((item) => {
          const tagIds = [...item.tags.map((t) => t.id), tagId];
          if (item.type === 'link') return setLinkTags.mutateAsync({ linkId: item.id, tagIds });
          if (item.type === 'note') return setNoteTags.mutateAsync({ noteId: item.id, tagIds });
          return setTaskTags.mutateAsync({ taskId: item.id, tagIds });
        }),
      );
      const failed = results.filter((result) => result.status === 'rejected').length;
      const applied = targets.length - failed;
      const items = (n: number) => `${n} item${n === 1 ? '' : 's'}`;
      if (failed === 0) {
        flash(`Applied “${tagName}” to ${items(applied)}.`);
        return;
      }
      console.error('Failed to bulk-apply tag:', results.find((result) => result.status === 'rejected'));
      cue('error');
      flash(
        applied === 0
          ? `Couldn’t apply “${tagName}”. Try again.`
          : `Applied “${tagName}” to ${items(applied)}; ${items(failed)} didn’t save. Try again.`,
      );
    },
    [flash, itemsByKey, selectedItemKeys, setLinkTags, setNoteTags, setTaskTags, tags],
  );

  const handleToggleTag = useCallback(
    (tagId: string) => {
      if (bulkAssignActive) {
        void handleBulkAddTag(tagId);
        return;
      }
      setSelectedTagIds(
        selectedTagIds.includes(tagId)
          ? selectedTagIds.filter((id) => id !== tagId)
          : [...selectedTagIds, tagId],
      );
    },
    [bulkAssignActive, handleBulkAddTag, selectedTagIds, setSelectedTagIds],
  );

  /* ---------- Capture ---------- */

  const rawInput = searchQuery.trim();
  const inputIsUrl = isUrlLike(rawInput);
  const captureTagIds = useMemo(() => [...selectedTagIds], [selectedTagIds]);

  const afterCreate = useCallback(
    (kind: ItemType, id: string, context: PendingAdd) => {
      const filing: Promise<unknown> | null = !context.spaceId
        ? null
        : kind === 'link'
          ? addLinksToProfile.mutateAsync({ profileId: context.spaceId, linkIds: [id] })
          : kind === 'note'
            ? addNotesToProfile.mutateAsync({ profileId: context.spaceId, noteIds: [id] })
            : addTasksToProfile.mutateAsync({ profileId: context.spaceId, taskIds: [id] });
      const tagging: Promise<unknown> | null =
        context.tagIds.length === 0
          ? null
          : kind === 'link'
            ? setLinkTags.mutateAsync({ linkId: id, tagIds: context.tagIds })
            : kind === 'note'
              ? setNoteTags.mutateAsync({ noteId: id, tagIds: context.tagIds })
              : setTaskTags.mutateAsync({ taskId: id, tagIds: context.tagIds });
      if (!filing && !tagging) {
        setPendingAdd(null);
        return;
      }
      // The item is saved either way: say what didn't stick, never put the text back
      void Promise.allSettled([filing, tagging])
        .then(([filed, tagged]) => {
          const fileFailed = filed.status === 'rejected';
          const tagFailed = tagged.status === 'rejected';
          if (!fileFailed && !tagFailed) return;
          console.error('Failed to apply filters after create:', filed, tagged);
          cue('error');
          const spaceName = profiles?.find((p) => p.id === context.spaceId)?.name ?? 'that space';
          flash(
            fileFailed && tagFailed
              ? `Saved, but couldn’t file it in ${spaceName} or add its tags.`
              : fileFailed
                ? `Saved, but couldn’t file it in ${spaceName}.`
                : 'Saved, but couldn’t add its tags.',
          );
        })
        .finally(() => setPendingAdd(null));
    },
    [
      addLinksToProfile,
      addNotesToProfile,
      addTasksToProfile,
      flash,
      profiles,
      setLinkTags,
      setNoteTags,
      setTaskTags,
    ],
  );

  /** A capture that didn't save: its text is back in the search box. */
  const reportCaptureFailed = useCallback(
    (context: PendingAdd) => {
      cue('error');
      setSearchQuery(context.rawInput);
      setPendingAdd(null);
      flash('Couldn’t save that. Your text is back in the search box.');
    },
    [flash],
  );

  const handleAddLink = useCallback(() => {
    const url = normalizeUrlInput(rawInput);
    if (!url || !inputIsUrl || pendingAdd !== null) return;
    const context: PendingAdd = {
      kind: 'link',
      rawInput,
      match: url,
      spaceId: captureSpaceId,
      tagIds: captureTagIds,
    };
    setPendingAdd(context);
    setSearchQuery('');
    cue('confirm');
    createLink.mutate(
      { url },
      {
        onSuccess: (created) => afterCreate('link', created.id, context),
        onError: () => reportCaptureFailed(context),
      },
    );
  }, [afterCreate, captureSpaceId, captureTagIds, createLink, inputIsUrl, pendingAdd, rawInput, reportCaptureFailed]);

  const handleAddNote = useCallback(() => {
    if (!rawInput || pendingAdd !== null) return;
    const context: PendingAdd = {
      kind: 'note',
      rawInput,
      match: rawInput,
      spaceId: captureSpaceId,
      tagIds: captureTagIds,
    };
    setPendingAdd(context);
    setSearchQuery('');
    cue('confirm');
    createNote.mutate(
      { title: rawInput },
      {
        onSuccess: (created) => {
          afterCreate('note', created.id, context);
          openNote(created.id);
        },
        onError: () => reportCaptureFailed(context),
      },
    );
  }, [afterCreate, captureSpaceId, captureTagIds, createNote, openNote, pendingAdd, rawInput, reportCaptureFailed]);

  const handleAddTask = useCallback(() => {
    if (!rawInput || pendingAdd !== null) return;
    const context: PendingAdd = {
      kind: 'task',
      rawInput,
      match: rawInput,
      spaceId: captureSpaceId,
      tagIds: captureTagIds,
    };
    setPendingAdd(context);
    setSearchQuery('');
    cue('confirm');
    createTask.mutate(
      { title: rawInput },
      {
        onSuccess: (created) => afterCreate('task', created.id, context),
        onError: () => reportCaptureFailed(context),
      },
    );
  }, [afterCreate, captureSpaceId, captureTagIds, createTask, pendingAdd, rawInput, reportCaptureFailed]);

  const linkAlreadyInStream = useMemo(() => {
    if (!inputIsUrl) return false;
    const url = normalizeUrlInput(rawInput);
    return filteredItems.some((item) => item.type === 'link' && item.link.url === url);
  }, [filteredItems, inputIsUrl, rawInput]);

  const createActions = useMemo<CommandCreateAction[]>(() => {
    const pending = pendingAdd !== null;
    if (!rawInput) return [];
    if (inputIsUrl) {
      return linkAlreadyInStream
        ? []
        : [
            {
              key: 'link',
              label: (
                <>
                  Add link <strong>{normalizeUrlInput(rawInput)}</strong>
                </>
              ),
              icon: <Plus aria-hidden="true" />,
              hint: '↵',
              pending: pending && pendingAdd?.kind === 'link',
              onRun: handleAddLink,
            },
          ];
    }
    const note: CommandCreateAction = {
      key: 'note',
      label: (
        <>
          New note <strong>“{rawInput}”</strong>
        </>
      ),
      icon: <Plus aria-hidden="true" />,
      hint: '⌘↵',
      pending: pending && pendingAdd?.kind === 'note',
      onRun: handleAddNote,
    };
    const task: CommandCreateAction = {
      key: 'task',
      label: (
        <>
          New task <strong>“{rawInput}”</strong>
        </>
      ),
      icon: <Square aria-hidden="true" />,
      hint: '⇧⌘↵',
      pending: pending && pendingAdd?.kind === 'task',
      onRun: handleAddTask,
    };
    // Standing in a task-only view, offer the task first
    const preferTask = selectedTypes.length === 1 && selectedTypes[0] === 'task';
    return preferTask ? [task, note] : [note, task];
  }, [
    handleAddLink,
    handleAddNote,
    handleAddTask,
    inputIsUrl,
    linkAlreadyInStream,
    pendingAdd,
    rawInput,
    selectedTypes,
  ]);

  // Palette matches span every type (ignoring the type chips), so a search
  // never dead-ends behind a filter
  const paletteGroups = useMemo<CommandResultGroup[]>(() => {
    if (!paletteSearch.trim()) return [];
    const matches = allItems
      .filter((item) => matchesTags(item) && itemMatchesSearch(item, paletteSearch))
      .sort(byUpdatedDesc);
    const order: ItemType[] = ['note', 'link', 'task'];
    return order.map((type) => {
      const ofType = matches.filter((item) => item.type === type);
      return {
        key: type,
        label: ITEM_TYPES.find((t) => t.key === type)?.plural ?? type,
        total: ofType.length,
        onSeeAll: () => updateParams((params) => setListParam(params, TYPE_PARAM, [type])),
        results: ofType.slice(0, PALETTE_RESULTS_PER_TYPE).map((item) => {
          if (item.type === 'link') {
            return {
              key: item.id,
              icon: <LinkIcon aria-hidden="true" />,
              title: getLinkTitle(item.link),
              meta: getHostname(item.link.url),
              onRun: () => openUrlInBackgroundTab(item.link.url),
            };
          }
          if (item.type === 'note') {
            return {
              key: item.id,
              icon: <StickyNote aria-hidden="true" />,
              title: noteDisplayTitle(item.note),
              meta: relativeTime(item.note.updated_at),
              onRun: () => openNote(item.id),
            };
          }
          return {
            key: item.id,
            icon: item.task.is_done ? <Check aria-hidden="true" /> : <Square aria-hidden="true" />,
            title: item.task.title,
            meta: item.task.is_done ? 'Done' : 'Task',
            onRun: () => updateParams((params) => setListParam(params, TYPE_PARAM, ['task'])),
          };
        }),
      };
    });
  }, [matchesTags, openNote, paletteSearch, allItems, setListParam, updateParams]);

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

  /** Turn a note that is just a URL into a link, carrying over its tags and spaces. */
  const handleConvertNoteToLink = useCallback(
    async (note: NoteWithTags, url: string) => {
      if (note.id.startsWith('temp-')) return;
      const noteTagIds = mergeTags(note.note_tags, note.tags).map((tag) => tag.id);
      const noteSpaceIds = (noteMembership ?? [])
        .filter((row) => row.note_id === note.id)
        .map((row) => row.profile_id);
      try {
        // Reuse an existing link for the same URL rather than duplicating it.
        const existing = (allLinks ?? []).find(
          (link) => link.url === url && !link.id.startsWith('temp-'),
        );
        const link = existing ?? (await createLink.mutateAsync({ url }));
        const tagIds = Array.from(
          new Set([
            ...(existing ? mergeTags(existing.link_tags, existing.tags, existing.tag) : []).map(
              (tag) => tag.id,
            ),
            ...noteTagIds,
          ]),
        );
        await Promise.all([
          noteTagIds.length > 0
            ? setLinkTags.mutateAsync({ linkId: link.id, tagIds })
            : Promise.resolve(),
          ...noteSpaceIds.map((profileId) =>
            addLinksToProfile.mutateAsync({ profileId, linkIds: [link.id] }),
          ),
        ]);
        if (openNoteId === note.id) closeNote();
        await deleteNote.mutateAsync(note.id);
        cue('confirm');
        flash(existing ? 'Merged into existing link.' : 'Converted to link.');
      } catch (error) {
        console.error('Failed to convert note to link:', error);
        cue('error');
        flash('Couldn’t convert to link.');
      }
    },
    [
      addLinksToProfile,
      allLinks,
      closeNote,
      createLink,
      deleteNote,
      flash,
      noteMembership,
      openNoteId,
      setLinkTags,
    ],
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

  const todayJotCount = useMemo(
    () =>
      scopeJots.filter((jot) => !hiddenJotIds.has(jot.id) && dayKeyOf(jot.created_at) === todayKey)
        .length,
    [hiddenJotIds, scopeJots, todayKey],
  );

  const handleDeleteJot = useCallback(
    (jot: SelfMessage) => {
      if (jot.id.startsWith('temp-')) return;
      const label = jot.body.length > 40 ? `${jot.body.slice(0, 40)}…` : jot.body;
      scheduleDelete(`jot:${jot.id}`, label, () => deleteSelfMessage.mutate(jot.id));
    },
    [deleteSelfMessage, scheduleDelete],
  );

  // A jot graduates into a note or task, and the jot is removed (its text
  // now lives in the item)
  const handleConvertJot = useCallback(
    async (jot: SelfMessage, kind: 'note' | 'task') => {
      const text = jot.body.trim();
      const firstLine = text.split('\n')[0].trim();
      try {
        if (kind === 'note') {
          const title = firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine;
          const body = text === firstLine && firstLine.length <= 80 ? '' : text;
          const created = await createNote.mutateAsync({ title, body });
          deleteSelfMessage.mutate(jot.id);
          cue('confirm');
          flash('Turned into a note.', { label: 'Open', onClick: () => openNote(created.id) });
        } else {
          const title = text.replace(/\s+/g, ' ').slice(0, 200);
          await createTask.mutateAsync({ title });
          deleteSelfMessage.mutate(jot.id);
          cue('confirm');
          flash('Added to tasks.');
        }
      } catch (error) {
        console.error('Failed to convert jot:', error);
        cue('error');
        flash('Couldn’t convert that jot.');
      }
    },
    [createNote, createTask, deleteSelfMessage, flash, openNote],
  );

  const handleOpenJournalItem = useCallback(
    (item: StreamItem) => {
      if (item.type === 'link') openUrlInBackgroundTab(item.link.url);
      else if (item.type === 'note') openNote(item.id);
      else updateParams((params) => setListParam(params, TYPE_PARAM, ['task']));
    },
    [openNote, setListParam, updateParams],
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

  const expandedIsPinned = Boolean(expandedLink?.is_super_favorite);

  const handleOpenLinkDetails = useCallback(
    (link: LinkWithTag) => {
      if (link.id.startsWith('temp-')) return;
      clearItemSelection();
      setSelectionMode(false);
      setExpandedLinkId(expandedLinkId === link.id ? null : link.id);
    },
    [clearItemSelection, expandedLinkId, setExpandedLinkId, setSelectionMode],
  );

  const handleTogglePin = useCallback(
    async (next: boolean) => {
      if (!expandedLinkId) return;
      cue('toggle');
      await updateLink.mutateAsync({ id: expandedLinkId, updates: { is_super_favorite: next } });
    },
    [expandedLinkId, updateLink],
  );

  const handleUpdateUrl = useCallback(
    async (url: string) => {
      if (!expandedLinkId) return;
      await updateLink.mutateAsync({ id: expandedLinkId, updates: { url } });
    },
    [expandedLinkId, updateLink],
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

  const viewTabs = useMemo<ViewTab[]>(() => {
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

  /* ---------- Source, Space and Sort menus ---------- */

  const sourceEntries = useMemo<MenuEntry[]>(
    () => [
      ...SOURCE_KEYS.map((key) => ({
        key,
        label: sourceKeyLabel(key),
        role: 'checkbox' as const,
        checked: selectedSources.includes(key),
        onSelect: () => toggleListValue(SOURCE_PARAM, selectedSources, key),
      })),
      ...(selectedSources.length
        ? [
            { key: 'divider', divider: true as const },
            { key: 'clear', label: 'Any source', onSelect: () => clearParam(SOURCE_PARAM) },
          ]
        : []),
    ],
    [clearParam, selectedSources, toggleListValue],
  );

  const spaceEntries = useMemo<MenuEntry[]>(
    () => [
      {
        key: UNFILED,
        label: 'Unfiled',
        role: 'checkbox' as const,
        checked: selectedSpaceFilter.includes(UNFILED),
        onSelect: () => toggleListValue(SPACE_PARAM, selectedSpaceFilter, UNFILED),
      },
      ...((profiles ?? []).length ? [{ key: 'divider-spaces', divider: true as const }] : []),
      ...(profiles ?? []).map((p) => ({
        key: p.id,
        label: p.name,
        role: 'checkbox' as const,
        checked: selectedSpaceFilter.includes(p.id),
        icon: <span className="memex-space-dot" style={{ background: spaceColors.get(p.id) }} aria-hidden="true" />,
        onSelect: () => toggleListValue(SPACE_PARAM, selectedSpaceFilter, p.id),
      })),
      ...(selectedSpaceFilter.length
        ? [
            { key: 'divider-clear', divider: true as const },
            { key: 'clear', label: 'Any space', onSelect: () => clearParam(SPACE_PARAM) },
          ]
        : []),
    ],
    [clearParam, profiles, selectedSpaceFilter, spaceColors, toggleListValue],
  );

  const sortEntries = useMemo<MenuEntry[]>(
    () =>
      SORT_OPTIONS.map((option) => ({
        key: `${option.field}:${option.direction}`,
        label: sortLabel(option),
        role: 'radio' as const,
        checked: sameSort(option, sort),
        onSelect: () => setSort(option),
      })),
    [setSort, sort],
  );

  const sourceSummary =
    selectedSources.length === 0
      ? 'Source'
      : selectedSources.length === 1
        ? `From ${sourceKeyLabel(selectedSources[0])}`
        : `Source · ${selectedSources.length}`;
  const activeSpaceFilter = activeFilters.spaces;
  const spaceSummary =
    activeSpaceFilter.length === 0
      ? 'Space'
      : activeSpaceFilter.length === 1
        ? activeSpaceFilter[0] === UNFILED
          ? 'Unfiled'
          : (spaceById.get(activeSpaceFilter[0])?.name ?? 'Space')
        : `Space · ${activeSpaceFilter.length}`;
  // The sort on screen when it isn't one of the menu's (a column header's)
  const sortSummary = sortLabel(sort);

  const filterMenus = (
    <>
      <span className="memex-filter-divider" aria-hidden="true" />
      <MenuButton
        triggerClassName={`bookmark-tag-chip memex-filter-menu${selectedSources.length ? ' is-active' : ''}`}
        triggerLabel={selectedSources.length ? `Source: ${selectedSources.map(sourceKeyLabel).join(', ')}` : 'Filter by source'}
        menuLabel="Source"
        entries={sourceEntries}
      >
        <span className="bookmark-tag-chip-label">{sourceSummary}</span>
        <ChevronDown aria-hidden="true" className="memex-filter-menu-caret" />
      </MenuButton>
      <MenuButton
        triggerClassName={`bookmark-tag-chip memex-filter-menu${activeSpaceFilter.length ? ' is-active' : ''}`}
        triggerLabel={activeSpaceFilter.length ? `Space: ${spaceSummary}` : 'Filter by space'}
        menuLabel="Space"
        entries={spaceEntries}
        menuClassName="memex-filter-menu-list"
      >
        {activeSpaceFilter.length === 1 && activeSpaceFilter[0] !== UNFILED && (
          <span
            className="memex-space-dot"
            style={{ background: spaceColors.get(activeSpaceFilter[0]) }}
            aria-hidden="true"
          />
        )}
        <span className="bookmark-tag-chip-label">{spaceSummary}</span>
        <ChevronDown aria-hidden="true" className="memex-filter-menu-caret" />
      </MenuButton>
    </>
  );

  const sortMenu = (
    <MenuButton
      triggerClassName="bookmark-tag-chip memex-filter-menu memex-sort-menu"
      triggerLabel={`Sort: ${sortSummary}`}
      title="Sort"
      menuLabel="Sort"
      entries={sortEntries}
      align="end"
    >
      <ArrowUpDown aria-hidden="true" className="memex-filter-menu-icon" />
      <span className="bookmark-tag-chip-label memex-sort-menu-label">{sortSummary}</span>
    </MenuButton>
  );

  /* ---------- Copy ---------- */

  const hasActiveFilters =
    rawInput.length > 0 ||
    selectedTypes.length > 0 ||
    selectedSources.length > 0 ||
    activeSpaceFilter.length > 0 ||
    selectedTagIds.length > 0 ||
    includeUntagged;

  const contextName = 'Library';
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

  const placeholder = `Search ${allItems.length} item${allItems.length === 1 ? '' : 's'} or capture…`;


  const openNoteSpaces = useMemo(() => {
    if (!openNoteItem) return [];
    const ids = new Set(
      (noteMembership ?? []).filter((row) => row.note_id === openNoteItem.id).map((row) => row.profile_id),
    );
    return (profiles ?? []).filter((p) => ids.has(p.id)).map((p) => p.name);
  }, [noteMembership, openNoteItem, profiles]);

  /* ---------- Render pieces ---------- */

  const showTasks = selectedTypes.length === 0 || selectedTypes.includes('task');
  const openTasks = useMemo(
    () =>
      openItems
        .filter((item): item is Extract<StreamItem, { type: 'task' }> => item.type === 'task')
        .map((item) => item.task),
    [openItems],
  );
  const doneTaskList = useMemo(
    () =>
      doneTasks
        .filter((item): item is Extract<StreamItem, { type: 'task' }> => item.type === 'task')
        .map((item) => item.task),
    [doneTasks],
  );
  const gridItems = useMemo(() => openItems.filter((item) => item.type !== 'task'), [openItems]);

  const renderExpanded = (link: LinkWithTag, variant: 'card' | 'row') => (
    <LinkExpandedCard
      link={link}
      variant={variant}
      isPinned={expandedIsPinned}
      onTogglePin={handleTogglePin}
      onOpen={() => handleOpenLink(link)}
      onClose={() => setExpandedLinkId(null)}
      onUpdateUrl={handleUpdateUrl}
      onRescrape={handleRescrape}
      onDelete={() => handleDeleteLink(link)}
      flash={flash}
    />
  );

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
  const openNoteCard = useStableCallback(handleOpenNote);
  const deleteNoteCard = useStableCallback(handleDeleteNote);
  const convertNoteCard = useStableCallback(handleConvertNoteToLink);
  const previewBroken = useStableCallback(markPreviewBroken);

  const renderCard = (key: string) => {
    const item = itemsByKey.get(key);
    if (!item) return null;
    const isSelected = selectedKeySet.has(item.key);
    if (item.type === 'link') {
      if (expandedLinkId === item.id) return renderExpanded(item.link, 'card');
      if (item.link.preview_image_url && !brokenPreviews.has(item.id)) {
        return (
          <LinkPreviewCard
            link={item.link}
            isSelected={isSelected}
            selectionMode={selectionMode}
            onActivate={activateLink}
            onImageError={previewBroken}
          />
        );
      }
      return (
        <LinkGridCard
          link={item.link}
          isSelected={isSelected}
          selectionMode={selectionMode}
          onActivate={activateLink}
        />
      );
    }
    if (item.type === 'note') {
      return (
        <NoteGridCard
          note={item.note}
          onOpen={openNoteCard}
          onDelete={deleteNoteCard}
          onConvertToLink={convertNoteCard}
          selectionMode={selectionMode}
          isSelected={isSelected}
          onToggleSelect={toggleSelectNote}
        />
      );
    }
    return null;
  };

  const masonryItems = useMemo<MasonryItem[]>(
    () =>
      gridItems.map((item) => ({
        key: item.key,
        span: item.type === 'link' && expandedLinkId === item.id ? 2 : 1,
      })),
    [expandedLinkId, gridItems],
  );

  useLayoutEffect(() => {
    gridKeysRef.current = masonryItems.map((item) => item.key);
  }, [masonryItems]);

  /** What the stream shows: a new value is a new query (scroll to top, crossfade). */
  const gridQueryKey = useMemo(
    () => JSON.stringify([activeFilters, gridSearch.trim().toLowerCase(), sort]),
    [activeFilters, gridSearch, sort],
  );

  // A new set of results fades in over the old (opacity only, ≤300ms) rather
  // than snapping; the old results stay up until the new ones are ready
  const streamBodyRef = useRef<HTMLDivElement>(null);
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

  // Heights for cards that haven't mounted yet: a picture's box from its
  // known (or guessed) ratio, text cards from their text. Measured cards
  // replace these, off-screen, before they scroll into view.
  const estimateCardHeight = useCallback(
    (key: string, width: number) => {
      const item = itemsByKey.get(key);
      if (!item || item.type === 'task') return 0;
      if (item.type === 'link' && expandedLinkId === item.id) return 440;
      const url = previewUrlOf(item);
      if (url && item.type === 'link') {
        const ratio = layoutRatio(url, item.link.url, item.link.source);
        if (document.documentElement.dataset.linkCaptions !== 'inset') return pictureHeight(width, ratio);
        // Inset print: padding, the picture, then host + title beneath it
        return 16 + pictureHeight(width - 16, ratio) + 32 + 20 * estimatedLines(getLinkTitle(item.link).length, width, 3);
      }
      if (item.type === 'note') {
        return textCardHeight(width, noteDisplayTitle(item.note).length, noteExcerptLength(item.note));
      }
      return textCardHeight(width, getLinkTitle(item.link).length);
    },
    [expandedLinkId, itemsByKey, previewUrlOf],
  );

  /** What a card's measured height depends on: a new token means measure again. */
  const cardSizeToken = useCallback(
    (key: string) => {
      const item = itemsByKey.get(key);
      if (!item || item.type === 'task') return '';
      if (item.type === 'note') return `n|${item.note.updated_at}`;
      if (expandedLinkId === item.id) return `x|${item.link.updated_at}`;
      const url = previewUrlOf(item);
      if (!url) return `t|${item.link.updated_at}`;
      return `p|${item.link.updated_at}|${getShownRatio(url) ?? getImageRatio(url) ?? '?'}|${document.documentElement.dataset.linkCaptions ?? ''}`;
    },
    [expandedLinkId, itemsByKey, previewUrlOf],
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
          {isExpanded && renderExpanded(link, 'row')}
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

  const viewToggle = (
    <div className="memex-view-toggle" role="group" aria-label="Layout">
      <button
        type="button"
        className={view === 'grid' ? 'is-active' : ''}
        aria-pressed={view === 'grid'}
        onClick={() => setView('grid')}
        aria-label="Grid view"
        title="Grid"
      >
        <LayoutGrid aria-hidden="true" />
      </button>
      <button
        type="button"
        className={view === 'list' ? 'is-active' : ''}
        aria-pressed={view === 'list'}
        onClick={() => setView('list')}
        aria-label="List view"
        title="List"
      >
        <Rows3 aria-hidden="true" />
      </button>
      <button
        type="button"
        className={view === 'table' ? 'is-active' : ''}
        aria-pressed={view === 'table'}
        onClick={() => setView('table')}
        aria-label="Table view"
        title="Table"
      >
        <Table2 aria-hidden="true" />
      </button>
    </div>
  );

  const nothingToShow = openItems.length === 0 && doneTasks.length === 0;

  /* ---------- Render ---------- */

  return (
    <div
      ref={pageRef}
      className={`bookmark-dashboard memex-stream-page${selectionMode ? ' has-selection-bar' : ''}`}
    >
      <AppHeader
        user={session?.user ?? null}
        title={contextName}
        subtitle={
          loadState === 'ready'
            ? `${allItems.length} item${allItems.length === 1 ? '' : 's'}`
            : loadState === 'loading'
              ? 'Loading…'
              : '\u00a0'
        }
        pinnedLinks={superFavoriteLinks}
        reserveLauncher={itemsPending && hadPinned}
        onPinnedOpen={handleOpenLink}
        actions={
          <button
            type="button"
            className={`btn-secondary btn-compact memex-journal-toggle${selfNotesOpen ? ' is-active' : ''}`}
            onClick={toggleSelfNotes}
            aria-pressed={selfNotesOpen}
            aria-keyshortcuts="J"
            title={selfNotesOpen ? 'Close journal (J)' : 'Open journal (J)'}
          >
            <BookOpen aria-hidden="true" />
            <span>Journal</span>
            {todayJotCount > 0 && (
              <span className="memex-journal-toggle-count" aria-label={`${todayJotCount} jots today`}>
                {todayJotCount}
              </span>
            )}
            <kbd className="memex-kbd memex-journal-toggle-kbd" aria-hidden="true">
              J
            </kbd>
          </button>
        }
      />

      <div
        className={`bookmark-feed-layout is-grid-wide is-empty-rails${
          selfNotesOpen ? ' has-self-notes' : ''
        }`}
      >
        {isNarrow && selfNotesOpen && (
          <button
            type="button"
            className="bookmark-mobile-scrim"
            aria-label="Close journal"
            onClick={closeSelfNotes}
          />
        )}

        <aside className="bookmark-rail bookmark-rail--profiles" aria-hidden="true" />

        <main className="bookmark-feed-main">
          <div className="bookmark-feed-main-inner is-grid-view">
            <FrostedStack>
              {openNoteItem ? (
                <NoteEditor
                  note={openNoteItem}
                  backLabel={contextName}
                  spaceNames={openNoteSpaces}
                  onBack={closeNote}
                  onSave={handleSaveNote}
                  onDelete={handleDeleteNote}
                />
              ) : (
                <>
                  <div className="bookmark-search-panel">
                    <CommandBar
                      value={searchQuery}
                      onChange={setSearchQuery}
                      placeholder={placeholder}
                      createActions={createActions}
                      groups={paletteGroups}
                      preferCreate={inputIsUrl}
                    />
                  </div>

                  <LibraryViewTabs
                    tabs={viewTabs}
                    activeId={activeView?.id ?? null}
                    onOpen={handleOpenView}
                    canSave={!activeView}
                    suggestedName={suggestedViewName}
                    onSave={handleSaveView}
                    canUpdate={canUpdateView}
                    onUpdate={handleUpdateView}
                    onRename={handleRenameView}
                    onDelete={handleDeleteView}
                  />

                  <StreamFilterBar
                    selectedTypes={selectedTypes}
                    typeCounts={typeCounts}
                    typeTotals={typeTotals}
                    onToggleType={toggleType}
                    tags={tagsForRow}
                    tagCounts={tagCounts}
                    selectedTagIds={selectedTagIds}
                    onToggleTag={handleToggleTag}
                    includeUntagged={includeUntagged}
                    untaggedCount={untaggedCount}
                    onToggleUntagged={toggleUntagged}
                    bulkAssignMode={bulkAssignActive}
                    afterTypes={filterMenus}
                    trailing={
                      <>
                        {sortMenu}
                        <button
                          type="button"
                          className={`bookmark-tag-chip memex-stream-select${
                            selectionMode ? ' is-active' : ''
                          }`}
                          onClick={selectionMode ? exitSelection : handleToggleSelectionMode}
                          aria-pressed={selectionMode}
                          title={selectionMode ? 'Done selecting (Esc)' : 'Select items to add to a space or delete'}
                        >
                          <span className="bookmark-tag-chip-label">
                            {selectionMode ? 'Done' : 'Select'}
                          </span>
                        </button>
                        {viewToggle}
                      </>
                    }
                  />

                  <div className="bookmark-list-panel-stack">
                    <div key={view} ref={streamBodyRef} className={`memex-grid-view memex-stream-body is-${view}`}>
                      {loadState === 'failed' ? (
                        <LoadErrorState what="your Library" onRetry={refetchLibrary} />
                      ) : itemsPending && nothingToShow ? (
                        <GridSkeleton />
                      ) : nothingToShow ? (
                        <EmptyState title={emptyTitle} subtitle={emptySubtitle} />
                      ) : view === 'table' ? (
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
                          expandedLinkId={expandedLinkId}
                          renderExpanded={(link) => renderExpanded(link, 'row')}
                          onOpenLinkDetails={handleOpenLinkDetails}
                          onOpenUrl={handleOpenLink}
                          onOpenNote={handleOpenNote}
                          onToggleTaskDone={handleToggleTaskDone}
                          onDelete={handleTableDelete}
                          brokenPreviews={brokenPreviews}
                          onPreviewError={markPreviewBroken}
                        />
                      ) : view === 'grid' ? (
                        <>
                          {showTasks && (openTasks.length > 0 || doneTaskList.length > 0) && (
                            <TaskBand
                              openTasks={openTasks}
                              doneTasks={doneTaskList}
                              onToggleDone={handleToggleTaskDone}
                              onDelete={handleDeleteTask}
                              selectionMode={selectionMode}
                              selectedKeys={selectedItemKeys}
                              onToggleSelect={(task) => handleToggleSelect(itemsByKey.get(itemKey('task', task.id))!)}
                            />
                          )}
                          {masonryItems.length > 0 ? (
                            <MasonryLayout
                              items={masonryItems}
                              renderItem={renderCard}
                              estimateHeight={estimateCardHeight}
                              sizeToken={cardSizeToken}
                              isPending={isCardPending}
                              subscribeEstimates={subscribeImageRatios}
                              onPrefetch={prefetchCards}
                              scrollKey={gridQueryKey}
                              restoreOnKeyChange={navigationType === 'POP'}
                              animateKey={expandedLinkId}
                            />
                          ) : (
                            openTasks.length === 0 && (
                              <EmptyState
                                title={hasActiveFilters ? emptyTitle : 'All clear'}
                                subtitle={hasActiveFilters ? emptySubtitle : 'Nothing open. Everything left is done.'}
                              />
                            )
                          )}
                        </>
                      ) : (
                        <div className="memex-list">
                          {listGroups.map((group) => (
                            <section key={group.label} className="memex-list-group" aria-label={group.label}>
                              <h2 className="memex-list-label">
                                {group.label}
                                <span className="memex-list-count">{group.items.length}</span>
                              </h2>
                              <div className="memex-list-rows">{group.items.map(renderRow)}</div>
                            </section>
                          ))}
                          {doneTasks.length > 0 && (
                            <section className="memex-list-group" aria-label="Done">
                              <button
                                type="button"
                                className="memex-list-label memex-list-toggle"
                                onClick={() => setShowDone((prev) => !prev)}
                                aria-expanded={showDone}
                              >
                                <ChevronRight aria-hidden="true" className={showDone ? 'is-open' : ''} />
                                Done
                                <span className="memex-list-count">{doneTasks.length}</span>
                              </button>
                              {showDone && <div className="memex-list-rows">{doneTasks.map(renderRow)}</div>}
                            </section>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </FrostedStack>
          </div>
        </main>

        {selfNotesOpen ? (
          <aside
            className={`bookmark-rail bookmark-rail--tags memex-self-notes-rail${
              isNarrow ? ' is-mobile-open' : ''
            }`}
            aria-label="Journal"
          >
            <JournalPanel
              scopeId={null}
              scopeName={contextName}
              items={allItems}
              hiddenJotIds={hiddenJotIds}
              onOpenItem={handleOpenJournalItem}
              onConvertJot={(jot, kind) => void handleConvertJot(jot, kind)}
              onDeleteJot={handleDeleteJot}
              onClose={closeSelfNotes}
              onFeedback={flash}
            />
          </aside>
        ) : (
          <aside className="bookmark-rail bookmark-rail--tags" aria-hidden="true" />
        )}
      </div>

      {selectionMode && (
        <SelectionBar
          count={selectedItemKeys.length}
          hiddenCount={hiddenSelectedCount}
          spaces={profiles ?? []}
          spaceColors={spaceColors}
          onAddToSpace={(id) => void addToSpace(id, selectedItemKeys)}
          onDelete={handleBulkDelete}
          onExit={exitSelection}
        />
      )}

      {toast !== null && (
        <FeedbackToast
          message={toast.message}
          phase={toast.phase}
          action={toast.action}
          onAnimationEnd={handleAnimationEnd}
        />
      )}
    </div>
  );
};

export default StreamPage;
