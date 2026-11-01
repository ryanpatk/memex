import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import LinkGridCard from '../components/LinkGridCard';
import CommandBar, {
  type CommandCreateAction,
  type CommandResultGroup,
} from '../components/stream/CommandBar';
import LinkExpandedCard from '../components/stream/LinkExpandedCard';
import LinkPreviewCard from '../components/stream/LinkPreviewCard';
import MasonryLayout, { type MasonryItem } from '../components/stream/MasonryLayout';
import StreamRow from '../components/stream/StreamRow';
import TaskBand from '../components/stream/TaskBand';
import SelectionBar from '../components/stream/SelectionBar';
import JournalPanel from '../components/stream/JournalPanel';
import NoteEditor from '../components/NoteEditor';
import NoteGridCard from '../components/NoteGridCard';
import SpaceDetailsModal from '../components/SpaceDetailsModal';
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
  isPendingItem,
  itemKey,
  itemMatchesSearch,
  mergeTags,
  countByType,
  countTags,
  countUntagged,
  isDoneTask,
  itemKeysInSpace,
  matchesTagFilter,
  matchesTypeFilter,
  orderTagsForRow,
  parseList,
  parseTypeFilter,
  pinnedLinks,
} from '@memex/core';
import {
  LIBRARY_PATH,
  LINK_PARAM,
  NOTE_PARAM,
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
import {
  useAddLinksToProfile,
  useProfileLinkMembership,
  useSetProfileLinkSuperFavorite,
} from '../hooks/useProfileLinks';
import { useAddNotesToProfile, useProfileNoteMembership } from '../hooks/useProfileNotes';
import { useAddTasksToProfile, useProfileTaskMembership } from '../hooks/useProfileTasks';
import { useProfiles } from '../hooks/useProfiles';
import { useTags } from '../hooks/useTags';
import { useAllTasks, useCreateTask, useDeleteTask, useUpdateTask } from '../hooks/useTasks';
import { useDeleteSelfMessage, useSelfMessages } from '../hooks/useSelfMessages';
import { useSetTaskTags } from '../hooks/useTaskTags';
import { urlScraperApi } from '../hooks/useUrlScraper';
import { useAppStore } from '../store';
import { handleBackgroundLinkClick, openUrlInBackgroundTab } from '../utils/openUrlInBackgroundTab';
import { cue } from '../utils/sound';
import { useSpaceColors } from '../hooks/useSpaceColors';
import type { RescrapeResult } from '../components/stream/LinkExpandedCard';
import {
  BookOpen,
  Check,
  ChevronRight,
  ExternalLink,
  LayoutGrid,
  Link as LinkIcon,
  Pencil,
  Plus,
  Rows3,
  Square,
  StickyNote,
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

type StreamView = 'grid' | 'list';

const readStoredView = (): StreamView => {
  try {
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
};

/**
 * The Library: a mixed stream of notes, links, and tasks — everything at
 * /library, or one space's contents at /spaces/:spaceId — with
 * element-type and tag chips above the grid, omnibar capture, and the
 * context's super favorites in the header.
 */
const StreamPage = () => {
  const { spaceId } = useParams<{ spaceId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { session } = useSession();

  const [searchQuery, setSearchQuery] = useState('');
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(() => new Set());
  const [brokenPreviews, setBrokenPreviews] = useState<Set<string>>(() => new Set());
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [spaceDetailsOpen, setSpaceDetailsOpen] = useState(false);
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

  const { data: allLinks } = useAllLinks();
  const { data: allNotes } = useAllNotes();
  const { data: allTasks } = useAllTasks();
  const { data: profiles } = useProfiles();
  const spaceColors = useSpaceColors();
  const { data: tags } = useTags();
  const { data: linkMembership } = useProfileLinkMembership();
  const { data: noteMembership } = useProfileNoteMembership();
  const { data: taskMembership } = useProfileTaskMembership();

  const createLink = useCreateLink();
  const updateLink = useUpdateLink();
  const deleteLink = useDeleteLink();
  const setLinkTags = useSetLinkTags();
  const addLinksToProfile = useAddLinksToProfile();
  const setProfileLinkSuperFavorite = useSetProfileLinkSuperFavorite();
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();
  const setNoteTags = useSetNoteTags();
  const addNotesToProfile = useAddNotesToProfile();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const setTaskTags = useSetTaskTags();
  const addTasksToProfile = useAddTasksToProfile();
  const deleteSelfMessage = useDeleteSelfMessage();
  const { messages: scopeJots } = useSelfMessages(spaceId ?? null);
  const { toast, flash, dismiss: dismissToast, handleAnimationEnd } = useFeedbackToast();

  /* ---------- URL state: type filter, tag filter, open note ---------- */

  const selectedTypes = useMemo(
    () => parseTypeFilter(searchParams.get(TYPE_PARAM)),
    [searchParams],
  );
  const selectedTagIds = useMemo(
    () => parseList(searchParams.get(TAGS_PARAM)),
    [searchParams],
  );
  const includeUntagged = searchParams.get(UNTAGGED_PARAM) === '1';
  const openNoteId = searchParams.get(NOTE_PARAM);
  const expandedLinkId = searchParams.get(LINK_PARAM);
  const todayKey = toDayKey(new Date());
  const viewParam = searchParams.get(VIEW_PARAM);
  const view: StreamView =
    viewParam === 'list' || viewParam === 'grid' ? viewParam : readStoredView();

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
      try {
        window.localStorage.setItem(VIEW_STORAGE_KEY, next);
      } catch {
        /* storage unavailable — URL still carries it */
      }
      updateParams((params) => {
        if (next === 'grid') params.delete(VIEW_PARAM);
        else params.set(VIEW_PARAM, next);
      }, true);
    },
    [updateParams],
  );

  /* ---------- Space resolution ---------- */

  const space = useMemo(
    () => (spaceId ? profiles?.find((p) => p.id === spaceId) : undefined),
    [profiles, spaceId],
  );

  // A deleted or foreign space id falls back to Home once spaces have loaded
  useEffect(() => {
    if (spaceId && profiles && !space) {
      navigate(LIBRARY_PATH, { replace: true });
    }
  }, [navigate, profiles, space, spaceId]);

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

  /** Keys of items that belong to the current space. */
  const spaceKeys = useMemo(
    () =>
      spaceId
        ? itemKeysInSpace({ links: linkMembership, notes: noteMembership, tasks: taskMembership }, spaceId)
        : new Set<string>(),
    [linkMembership, noteMembership, spaceId, taskMembership],
  );

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

  const inScope = useCallback(
    (item: StreamItem) => {
      if (!spaceId) return true;
      if (isPendingMatch(item)) return pendingAdd?.spaceId === spaceId;
      return spaceKeys.has(item.key);
    },
    [isPendingMatch, pendingAdd, spaceId, spaceKeys],
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
    (item: StreamItem) => itemMatchesSearch(item, searchQuery),
    [searchQuery],
  );

  const scopedItems = useMemo(() => allItems.filter(inScope), [allItems, inScope]);

  const filteredItems = useMemo(
    () =>
      scopedItems
        .filter((item) => matchesType(item) && matchesTags(item) && matchesSearch(item))
        .sort(byUpdatedDesc),
    [matchesSearch, matchesTags, matchesType, scopedItems],
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
    () => countByType(scopedItems.filter((item) => matchesTags(item) && matchesSearch(item))),
    [matchesSearch, matchesTags, scopedItems],
  );

  // Unfiltered per-type totals for the current scope drive the chip order
  const typeTotals = useMemo(() => countByType(scopedItems), [scopedItems]);

  const itemsForTagRow = useMemo(
    () => scopedItems.filter((item) => matchesType(item) && matchesSearch(item)),
    [matchesSearch, matchesType, scopedItems],
  );

  const tagCounts = useMemo(() => countTags(itemsForTagRow), [itemsForTagRow]);

  const untaggedCount = useMemo(() => countUntagged(itemsForTagRow), [itemsForTagRow]);

  const tagsForRow = useMemo(
    () => orderTagsForRow(tags ?? [], tagCounts, { inSpace: Boolean(spaceId), selectedTagIds }),
    [selectedTagIds, spaceId, tagCounts, tags],
  );

  /* ---------- Super favorites (header) ---------- */

  const superFavoriteLinks = useMemo(
    () => pinnedLinks(allItems, linkMembership ?? [], spaceId),
    [allItems, linkMembership, spaceId],
  );

  /* ---------- Selection ---------- */

  const bulkAssignActive = selectionMode && selectedItemKeys.length > 0;

  // Selection survives filters and search (gather across several views);
  // only switching space starts over
  useEffect(() => {
    clearItemSelection();
    setSelectionMode(false);
  }, [clearItemSelection, setSelectionMode, spaceId]);

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
      flash(`Applied “${tagName}” to ${targets.length} item${targets.length === 1 ? '' : 's'}.`);
      cue('move');

      try {
        await Promise.all(
          targets.map((item) => {
            const tagIds = [...item.tags.map((t) => t.id), tagId];
            if (item.type === 'link') return setLinkTags.mutateAsync({ linkId: item.id, tagIds });
            if (item.type === 'note') return setNoteTags.mutateAsync({ noteId: item.id, tagIds });
            return setTaskTags.mutateAsync({ taskId: item.id, tagIds });
          }),
        );
      } catch (error) {
        console.error('Failed to bulk-apply tag:', error);
      }
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
      const postCreate: Promise<unknown>[] = [];
      if (context.spaceId) {
        if (kind === 'link') {
          postCreate.push(
            addLinksToProfile.mutateAsync({ profileId: context.spaceId, linkIds: [id] }),
          );
        } else if (kind === 'note') {
          postCreate.push(
            addNotesToProfile.mutateAsync({ profileId: context.spaceId, noteIds: [id] }),
          );
        } else {
          postCreate.push(
            addTasksToProfile.mutateAsync({ profileId: context.spaceId, taskIds: [id] }),
          );
        }
      }
      if (context.tagIds.length > 0) {
        if (kind === 'link') {
          postCreate.push(setLinkTags.mutateAsync({ linkId: id, tagIds: context.tagIds }));
        } else if (kind === 'note') {
          postCreate.push(setNoteTags.mutateAsync({ noteId: id, tagIds: context.tagIds }));
        } else {
          postCreate.push(setTaskTags.mutateAsync({ taskId: id, tagIds: context.tagIds }));
        }
      }
      if (postCreate.length === 0) {
        setPendingAdd(null);
        return;
      }
      void Promise.all(postCreate)
        .catch((error) => {
          console.error('Failed to apply filters after create:', error);
        })
        .finally(() => setPendingAdd(null));
    },
    [
      addLinksToProfile,
      addNotesToProfile,
      addTasksToProfile,
      setLinkTags,
      setNoteTags,
      setTaskTags,
    ],
  );

  const handleAddLink = useCallback(() => {
    const url = normalizeUrlInput(rawInput);
    if (!url || !inputIsUrl || pendingAdd !== null) return;
    const context: PendingAdd = {
      kind: 'link',
      rawInput,
      match: url,
      spaceId: spaceId ?? null,
      tagIds: captureTagIds,
    };
    setPendingAdd(context);
    setSearchQuery('');
    cue('confirm');
    createLink.mutate(
      { url },
      {
        onSuccess: (created) => afterCreate('link', created.id, context),
        onError: () => {
          cue('error');
          setSearchQuery(context.rawInput);
          setPendingAdd(null);
        },
      },
    );
  }, [afterCreate, captureTagIds, createLink, inputIsUrl, pendingAdd, rawInput, spaceId]);

  const handleAddNote = useCallback(() => {
    if (!rawInput || pendingAdd !== null) return;
    const context: PendingAdd = {
      kind: 'note',
      rawInput,
      match: rawInput,
      spaceId: spaceId ?? null,
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
        onError: () => {
          cue('error');
          setSearchQuery(context.rawInput);
          setPendingAdd(null);
        },
      },
    );
  }, [afterCreate, captureTagIds, createNote, openNote, pendingAdd, rawInput, spaceId]);

  const handleAddTask = useCallback(() => {
    if (!rawInput || pendingAdd !== null) return;
    const context: PendingAdd = {
      kind: 'task',
      rawInput,
      match: rawInput,
      spaceId: spaceId ?? null,
      tagIds: captureTagIds,
    };
    setPendingAdd(context);
    setSearchQuery('');
    cue('confirm');
    createTask.mutate(
      { title: rawInput },
      {
        onSuccess: (created) => afterCreate('task', created.id, context),
        onError: () => {
          cue('error');
          setSearchQuery(context.rawInput);
          setPendingAdd(null);
        },
      },
    );
  }, [afterCreate, captureTagIds, createTask, pendingAdd, rawInput, spaceId]);

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
    if (!rawInput) return [];
    const matches = scopedItems.filter((item) => matchesTags(item) && matchesSearch(item)).sort(byUpdatedDesc);
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
  }, [matchesSearch, matchesTags, openNote, rawInput, scopedItems, setListParam, updateParams]);

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

  // A jot graduates into a note or task: the new item joins the current
  // space, and the jot is removed (its text now lives in the item)
  const handleConvertJot = useCallback(
    async (jot: SelfMessage, kind: 'note' | 'task') => {
      const text = jot.body.trim();
      const firstLine = text.split('\n')[0].trim();
      try {
        if (kind === 'note') {
          const title = firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine;
          const body = text === firstLine && firstLine.length <= 80 ? '' : text;
          const created = await createNote.mutateAsync({ title, body });
          if (spaceId) await addNotesToProfile.mutateAsync({ profileId: spaceId, noteIds: [created.id] });
          deleteSelfMessage.mutate(jot.id);
          cue('confirm');
          flash('Turned into a note.', { label: 'Open', onClick: () => openNote(created.id) });
        } else {
          const title = text.replace(/\s+/g, ' ').slice(0, 200);
          const created = await createTask.mutateAsync({ title });
          if (spaceId) await addTasksToProfile.mutateAsync({ profileId: spaceId, taskIds: [created.id] });
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
    [addNotesToProfile, addTasksToProfile, createNote, createTask, deleteSelfMessage, flash, openNote, spaceId],
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

  const expandedIsPinned = useMemo(() => {
    if (!expandedLink) return false;
    if (!spaceId) return Boolean(expandedLink.is_super_favorite);
    return (linkMembership ?? []).some(
      (row) =>
        row.profile_id === spaceId && row.link_id === expandedLink.id && row.is_super_favorite,
    );
  }, [expandedLink, linkMembership, spaceId]);

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
      if (spaceId) {
        await setProfileLinkSuperFavorite.mutateAsync({
          profileId: spaceId,
          linkId: expandedLinkId,
          isSuperFavorite: next,
        });
        return;
      }
      await updateLink.mutateAsync({ id: expandedLinkId, updates: { is_super_favorite: next } });
    },
    [expandedLinkId, setProfileLinkSuperFavorite, spaceId, updateLink],
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

  /** Keys of the selectable items on screen, in display order. */
  const renderedKeys = useCallback(
    () =>
      Array.from(
        pageRef.current?.querySelectorAll<HTMLElement>('.memex-stream-body [data-item-key]') ?? [],
      )
        .map((el) => el.dataset.itemKey as string)
        .filter((key) => !key.includes(':temp-')),
    [],
  );

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

  /* ---------- Copy ---------- */

  const hasActiveFilters =
    rawInput.length > 0 ||
    selectedTypes.length > 0 ||
    selectedTagIds.length > 0 ||
    includeUntagged;

  const contextName = space?.name ?? 'Library';
  const typeLabel =
    selectedTypes.length === 1
      ? ITEM_TYPES.find((t) => t.key === selectedTypes[0])?.plural.toLowerCase() ?? 'items'
      : 'items';

  const emptyTitle = hasActiveFilters
    ? `No ${typeLabel} match`
    : spaceId
      ? 'This space is empty'
      : 'Nothing here yet';
  const emptySubtitle = hasActiveFilters
    ? rawInput
      ? 'Other types may match — check the search results above, or press ⌘↵ to save what you typed.'
      : 'Try another type, or clear the filters.'
    : spaceId
      ? 'Capture something above, or select items in the Library and add them here.'
      : 'Paste a URL or type a thought above to capture it.';

  const placeholder = space
    ? `Search “${space.name}” or capture…`
    : `Search ${scopedItems.length} item${scopedItems.length === 1 ? '' : 's'} or capture…`;


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
    />
  );

  const renderCard = (item: StreamItem) => {
    const isSelected = selectedItemKeys.includes(item.key);
    if (item.type === 'link') {
      if (expandedLinkId === item.id) return renderExpanded(item.link, 'card');
      const activate = () =>
        selectionMode ? handleToggleSelect(item) : handleOpenLinkDetails(item.link);
      if (item.link.preview_image_url && !brokenPreviews.has(item.id)) {
        return (
          <LinkPreviewCard
            link={item.link}
            isSelected={isSelected}
            selectionMode={selectionMode}
            onActivate={activate}
            onImageError={() => markPreviewBroken(item.id)}
          />
        );
      }
      return (
        <LinkGridCard
          link={item.link}
          isSelected={isSelected}
          selectionMode={selectionMode}
          onActivate={activate}
        />
      );
    }
    if (item.type === 'note') {
      return (
        <NoteGridCard
          note={item.note}
          onOpen={handleOpenNote}
          onDelete={handleDeleteNote}
          onConvertToLink={handleConvertNoteToLink}
          selectionMode={selectionMode}
          isSelected={isSelected}
          onToggleSelect={() => handleToggleSelect(item)}
        />
      );
    }
    return null;
  };

  const masonryItems: MasonryItem[] = gridItems.map((item) => ({
    key: item.key,
    span: item.type === 'link' && expandedLinkId === item.id ? 2 : 1,
    node: renderCard(item),
  }));

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

  const listGroups = useMemo(() => groupByTime(openItems, (item) => item.updatedAt), [openItems]);

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
        titleColor={space ? spaceColors.get(space.id) : undefined}
        subtitle={`${scopedItems.length} item${scopedItems.length === 1 ? '' : 's'}`}
        pinnedLinks={superFavoriteLinks}
        onPinnedOpen={handleOpenLink}
        actions={
          <>
            {space && (
              <button
                type="button"
                className="btn-secondary btn-compact"
                onClick={() => setSpaceDetailsOpen(true)}
                aria-haspopup="dialog"
              >
                <Pencil aria-hidden="true" /> Edit space
              </button>
            )}
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
          </>
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
                    trailing={
                      <>
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
                    <div key={view} className={`memex-grid-view memex-stream-body is-${view}`}>
                      {nothingToShow ? (
                        <EmptyState title={emptyTitle} subtitle={emptySubtitle} />
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
                            <MasonryLayout items={masonryItems} animateKey={expandedLinkId} />
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
              scopeId={spaceId ?? null}
              scopeName={contextName}
              items={scopedItems}
              hiddenJotIds={hiddenJotIds}
              onOpenItem={handleOpenJournalItem}
              onConvertJot={(jot, kind) => void handleConvertJot(jot, kind)}
              onDeleteJot={handleDeleteJot}
              onClose={closeSelfNotes}
            />
          </aside>
        ) : (
          <aside className="bookmark-rail bookmark-rail--tags" aria-hidden="true" />
        )}
      </div>

      {space && (
        <SpaceDetailsModal
          space={space}
          isOpen={spaceDetailsOpen}
          onClose={() => setSpaceDetailsOpen(false)}
          typeTotals={typeTotals}
          onFeedback={flash}
        />
      )}

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
