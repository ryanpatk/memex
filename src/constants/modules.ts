/**
 * Navigation model (ROADMAP.md Phase 1, decision 12B): the Journal is home
 * at `/`; the Library (`/library`) is the mixed stream of everything, and
 * `/spaces/:id` scopes it to one space. `/tasks` is the Tasks view (open
 * tasks across every space). The old routes (/home, /links, /notes) redirect
 * into the Library, carrying their query along.
 */

export const JOURNAL_PATH = '/';
export const LIBRARY_PATH = '/library';
/** The Library's old address; the extension still deep-links `/home?link=<id>`. */
export const LEGACY_HOME_PATH = '/home';
export const SPACES_PATH = '/spaces';
/** The Tasks view: open tasks across spaces, grouped by space or due date. */
export const TASKS_PATH = '/tasks';

export const spacePath = (spaceId: string) => `${SPACES_PATH}/${spaceId}`;

/** Where the auth pages land a signed-in user. */
export const DEFAULT_MODULE_PATH = JOURNAL_PATH;

/** Query param carrying the type filter (comma-separated ItemType keys). */
export const TYPE_PARAM = 'type';
/** Query param carrying selected tag ids (comma-separated). */
export const TAGS_PARAM = 'tags';
/** Query param flag for the "Untagged" filter. */
export const UNTAGGED_PARAM = 'untagged';
/** Query param for the Source filter (comma-separated: x, pinterest, youtube, web). */
export const SOURCE_PARAM = 'source';
/** Query param for the Library's Space filter (space ids and `unfiled`). */
export const SPACE_PARAM = 'space';
/** Query param for the Library sort (`<field>:<asc|desc>`; absent = recently updated). */
export const SORT_PARAM = 'sort';
/** Query param that opens a note in the in-stack editor. */
export const NOTE_PARAM = 'note';
/** URL param for a link expanded in place in the stream (?link=<id>). */
export const LINK_PARAM = 'link';
/** URL param for the Library layout: absent/`grid` = masonry, `list` = reading list, `table` = the Table. */
export const VIEW_PARAM = 'view';
/** Tasks view grouping: absent = by space, `date` = by due date. */
export const GROUP_PARAM = 'group';
/** Tasks view: the Done list is open (`?done=1`). */
export const DONE_PARAM = 'done';
/** Journal: the Inbox tray is open (`?inbox=1`). */
export const INBOX_PARAM = 'inbox';

/**
 * Tag UI is parked while the core stream is refined: hides the tag chip row
 * and the tag pills on cards. Tag data, `?tags=` filtering, and tag editing in
 * the link details panel keep working; flip to true to show tags again.
 */
export const SHOW_TAGS_UI = false;
