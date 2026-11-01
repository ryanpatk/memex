/**
 * Navigation model (ROADMAP.md Phase 1, decision 12B): the Journal is home
 * at `/`; the Library (`/library`) is the mixed stream of everything, and
 * `/spaces/:id` scopes it to one space. The old routes (/home, /links,
 * /notes, /tasks) redirect into the Library, carrying their query along.
 */

export const JOURNAL_PATH = '/';
export const LIBRARY_PATH = '/library';
/** The Library's old address; the extension still deep-links `/home?link=<id>`. */
export const LEGACY_HOME_PATH = '/home';
export const SPACES_PATH = '/spaces';

export const spacePath = (spaceId: string) => `${SPACES_PATH}/${spaceId}`;

/** Where the auth pages land a signed-in user. */
export const DEFAULT_MODULE_PATH = JOURNAL_PATH;

/** Query param carrying the type filter (comma-separated ItemType keys). */
export const TYPE_PARAM = 'type';
/** Query param carrying selected tag ids (comma-separated). */
export const TAGS_PARAM = 'tags';
/** Query param flag for the "Untagged" filter. */
export const UNTAGGED_PARAM = 'untagged';
/** Query param that opens a note in the in-stack editor. */
export const NOTE_PARAM = 'note';
/** URL param for a link expanded in place in the stream (?link=<id>). */
export const LINK_PARAM = 'link';
/** URL param for the stream layout: absent/`grid` = masonry, `list` = reading list. */
export const VIEW_PARAM = 'view';
/** Journal: the Inbox tray is open (`?inbox=1`). */
export const INBOX_PARAM = 'inbox';

/**
 * Tag UI is parked while the core stream is refined: hides the tag chip row
 * and the tag pills on cards. Tag data, `?tags=` filtering, and tag editing in
 * the link details panel keep working; flip to true to show tags again.
 */
export const SHOW_TAGS_UI = false;
