/**
 * memex's MCP tools. Each one names the access it needs (`read` or `write`);
 * a token only sees and can call the tools its scope allows. The read tools
 * are thin wrappers over `createAgentReadService` and the write tools over
 * `createAgentWriteService` (@memex/core/agent), which do the validation,
 * ownership checks, paging, size caps and idempotency.
 *
 * Write rules (writeTypes.ts): agents add new items (marked captured_by =
 * 'agent' + the client name); any change to an existing item they didn't
 * create becomes an Inbox proposal. No tool deletes or bulk-edits.
 */
import * as z from 'zod/v4';
import {
  AGENT_ITEM_TYPES,
  AGENT_LIMITS,
  AGENT_SOURCES,
  AGENT_WRITE_LIMITS,
  IMAGE_LIMITS,
  PROPOSAL_ITEM_TYPES,
  writeRef,
  type AgentReadService,
  type AgentWriteService,
  type ToolAccess,
} from '../../../packages/core/src/agent';

const day = (what: string) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe(`${what} (YYYY-MM-DD, a calendar day in \`timezone\`)`);
const timezone = z
  .string()
  .max(64)
  .describe('IANA time zone for day boundaries, e.g. "America/New_York". Default "UTC".');
const spaceId = z.uuid().describe('A space id from list_spaces');
const cursor = z.string().max(120).describe('next_cursor from the previous page; leave out for the first page');
const types = z
  .array(z.enum(AGENT_ITEM_TYPES))
  .max(AGENT_ITEM_TYPES.length)
  .describe('Item types to include: link, note, task, jot. Default: all');

export interface ToolContext {
  reads: AgentReadService;
  /** Only built for tokens whose scope allows write tools. */
  writes: AgentWriteService | null;
}

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  access: ToolAccess;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema: z.ZodObject<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run(ctx: ToolContext, args: any): Promise<unknown>;
  /** How many things the result holds, for the audit log. */
  count(result: unknown): number;
  /** What a write produced ("note:<id>", "proposal:<id>"), for the audit log. Ids only. */
  ref?(result: unknown): string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const len = (value: any) => (Array.isArray(value) ? value.length : 0);

const BASE_INSTRUCTIONS = `memex is the user's personal working memory: one Journal of everything they save and write, filed into spaces.

Items come in four types:
- link: a saved web page or post (title, description, url, source: x, pinterest, youtube or web)
- note: a markdown document
- task: a to-do (done, due_date)
- jot: a short message in the Journal, like a note to self

A space is a project or context (a trip, a job search, a codebase). Items can sit in several spaces or none ("unfiled"). Tags are extra labels.

Reading memex as project context:
1. list_spaces to find the space for the project, then space_overview for its counts and latest items.
2. search for words across titles, descriptions, note text and URLs; narrow with types, space_id, source or dates.
3. get_item to read one item in full (lists only carry excerpts); get_images for pictures (URLs).
4. get_journal for what happened on given days; timeline_stats for activity over time.

Lists are newest first (the Journal is oldest first) and paged: pass next_cursor back as cursor for more. Dates are YYYY-MM-DD days in the timezone you pass (default UTC). Every result is scoped to the token's owner.`;

/** For `read` tokens. */
export const READ_INSTRUCTIONS = `${BASE_INSTRUCTIONS}

This token can only read; nothing here changes memex.`;

/** For `read_write` tokens. */
export const WRITE_INSTRUCTIONS = `${BASE_INSTRUCTIONS}

Storing project context (this token can also write):
- Find the project's space with list_spaces and pass its id as space_id when you write. memex has no tool to create spaces; if there isn't one, write unfiled and tell the user so they can make one.
- Keep ONE note per project (for example "<project>: context") and add to it over time: create_note once, remember its id (search finds it later by title), then append_to_note with dated entries. Read it back with get_item at the start of a session.
- add_jot for a quick timestamped insight or decision; create_task for a concrete next step; save_link for a useful URL (memex dedupes it).
- Everything you write is marked as written by this client and shows in the user's Journal labelled "via <client name>".
- You only ADD. To change anything that already exists (file it into a space, retitle, edit, complete a task) use propose_change: the user approves or rejects it in their Inbox. append_to_note on a note you didn't create becomes such a proposal too. Nothing can be deleted.
- Send an idempotency_key (any unique string, e.g. a UUID) with each write and reuse it if you retry the same call, so a retry never writes twice.`;

const idempotencyKey = z
  .string()
  .min(AGENT_WRITE_LIMITS.keyMinChars)
  .max(AGENT_WRITE_LIMITS.keyMaxChars)
  .regex(/^[A-Za-z0-9_.:-]+$/)
  .describe('A unique string for this write (e.g. a UUID). Retrying with the same key and arguments returns the first result instead of writing again');
const writeSpace = z.uuid().describe('File it into this space (an id from list_spaces), usually the project\'s space');
const created = (r: unknown) => ((r as { replayed?: boolean }).replayed ? 0 : 1);
const unwrap = (writes: AgentWriteService | null) => {
  // runTool checks scope before calling run; this guards against a wiring mistake.
  if (!writes) throw new Error('write tools need a read_write token');
  return writes;
};

export const TOOLS: ToolDef[] = [
  {
    name: 'search',
    title: 'Search memex',
    description:
      'Find links, notes, tasks and jots containing every word of `query` (case-insensitive, matched in titles, link descriptions and URLs, note text, task details and jot text). Newest first, paged. Results carry excerpts; call get_item for the full text.',
    access: 'read',
    inputSchema: z.object({
      query: z.string().min(1).max(AGENT_LIMITS.queryChars).describe('Words to find; every word must appear (up to 6 words)'),
      types: types.optional(),
      space_id: spaceId.optional().describe('Only items filed in this space (id from list_spaces)'),
      source: z.enum(AGENT_SOURCES).optional().describe('Only links saved from this platform (x, pinterest, youtube, or web for everything else)'),
      from: day('Created on or after this day').optional(),
      to: day('Created on or before this day').optional(),
      timezone: timezone.optional(),
      limit: z.number().int().min(1).max(AGENT_LIMITS.pageMax).optional().describe(`Items per page, default ${AGENT_LIMITS.pageDefault}`),
      cursor: cursor.optional(),
    }),
    run: ({ reads }, args) => reads.search(args),
    count: (r) => len((r as { items?: unknown[] }).items),
  },
  {
    name: 'get_item',
    title: 'Read one item',
    description:
      `Read one link, note, task or jot in full: the whole note text (up to ${AGENT_LIMITS.fullTextChars} characters; text_truncated says if it was cut), task detail, link metadata, spaces, tags, and who wrote it (captured_by "agent" + captured_client for items an agent wrote). Use the type and id from search, get_journal or space_overview.`,
    access: 'read',
    inputSchema: z.object({
      type: z.enum(AGENT_ITEM_TYPES).describe('The item type: link, note, task or jot'),
      id: z.uuid().describe('The item id'),
    }),
    run: ({ reads }, args) => reads.getItem(args),
    count: () => 1,
  },
  {
    name: 'get_journal',
    title: 'Read the Journal',
    description:
      `Everything saved or written on a range of days, oldest first and grouped by day, like the memex Journal. Up to ${AGENT_LIMITS.journalRangeDays} days per call; paged.`,
    access: 'read',
    inputSchema: z.object({
      from: day('First day'),
      to: day('Last day, inclusive; default: same as from').optional(),
      timezone: timezone.optional(),
      types: types.optional(),
      space_id: spaceId.optional().describe('Only items filed in this space'),
      limit: z.number().int().min(1).max(AGENT_LIMITS.journalPageMax).optional().describe(`Items per page, default ${AGENT_LIMITS.journalPageDefault}`),
      cursor: cursor.optional(),
    }),
    run: ({ reads }, args) => reads.getJournal(args),
    count: (r) =>
      ((r as { days?: { items: unknown[] }[] }).days ?? []).reduce((n, d) => n + d.items.length, 0),
  },
  {
    name: 'list_spaces',
    title: 'List spaces',
    description:
      'Every space (project or context) with its id and how many links, notes, tasks and jots are filed in it. Start here to find the space for a project.',
    access: 'read',
    inputSchema: z.object({}),
    run: ({ reads }) => reads.listSpaces(),
    count: (r) => len((r as { spaces?: unknown[] }).spaces),
  },
  {
    name: 'space_overview',
    title: 'Space overview',
    description:
      'One space at a glance: its counts by type and its most recent items, newest first (paged with cursor).',
    access: 'read',
    inputSchema: z.object({
      space_id: spaceId,
      limit: z.number().int().min(1).max(AGENT_LIMITS.recentMax).optional().describe('Recent items to include, default 10'),
      cursor: cursor.optional(),
    }),
    run: ({ reads }, args) => reads.spaceOverview(args),
    count: (r) => len((r as { recent?: unknown[] }).recent),
  },
  {
    name: 'timeline_stats',
    title: 'Activity over time',
    description:
      `Counts of items created per day, week or month, with totals by type, links by source and items by space. Default: the last 30 days. Ranges up to ${AGENT_LIMITS.statsRangeDays} days.`,
    access: 'read',
    inputSchema: z.object({
      from: day('First day; default 29 days before `to`').optional(),
      to: day('Last day, inclusive; default today').optional(),
      timezone: timezone.optional(),
      space_id: spaceId.optional().describe('Only items filed in this space'),
      bucket: z.enum(['day', 'week', 'month']).optional().describe('Series granularity; default by range length'),
    }),
    run: ({ reads }, args) => reads.timelineStats(args),
    count: (r) => len((r as { series?: unknown[] }).series),
  },
  {
    name: 'get_images',
    title: 'Images',
    description:
      `Picture URLs (never bytes) for one item (type + id: a link's preview image, images embedded in a note) or for a space (space_id: its newest items that have pictures, ${IMAGE_LIMITS.pageDefault} items per page). Open the URLs yourself if you can view images.`,
    access: 'read',
    inputSchema: z.object({
      type: z.enum(AGENT_ITEM_TYPES).optional().describe('With id: one item'),
      id: z.uuid().optional().describe('With type: one item'),
      space_id: spaceId.optional().describe('Instead of type + id: a space'),
      limit: z.number().int().min(1).max(IMAGE_LIMITS.pageMax).optional().describe(`Items per page for a space, default ${IMAGE_LIMITS.pageDefault}`),
      cursor: cursor.optional(),
    }),
    run: ({ reads }, args) => reads.getImages(args),
    count: (r) => ((r as { items?: { images: unknown[] }[] }).items ?? []).reduce((n, i) => n + i.images.length, 0),
  },

  // ── write tools (read_write tokens only) ─────────────────────────────────
  {
    name: 'add_jot',
    title: 'Add a jot',
    description:
      `Write a short jot (up to ${AGENT_WRITE_LIMITS.jotChars} characters) into the user's Journal, optionally in a space: a decision, an insight, a status line. It shows as "via <your client name>". Returns its id.`,
    access: 'write',
    inputSchema: z.object({
      text: z.string().min(1).max(AGENT_WRITE_LIMITS.jotChars).describe('The jot, plain text'),
      space_id: writeSpace.optional(),
      idempotency_key: idempotencyKey.optional(),
    }),
    run: ({ writes }, args) => unwrap(writes).addJot(args),
    count: created,
    ref: writeRef,
  },
  {
    name: 'save_link',
    title: 'Save a link',
    description:
      'Save a URL to the user\'s Library (memex fetches its title and picture). If they already saved the same page or post, nothing is written and `duplicate: true` comes back with the existing link; filing an existing link the user saved into a space becomes an Inbox proposal (`filed: "proposed"`).',
    access: 'write',
    inputSchema: z.object({
      url: z.string().min(8).max(2048).describe('The full http(s) URL'),
      title: z.string().max(AGENT_WRITE_LIMITS.linkTitleChars).optional().describe('A title, if you know a better one than the page\'s'),
      note: z.string().max(AGENT_WRITE_LIMITS.linkNoteChars).optional().describe('Why it matters (stored as the link\'s description)'),
      space_id: writeSpace.optional(),
      idempotency_key: idempotencyKey.optional(),
    }),
    run: ({ writes }, args) => unwrap(writes).saveLink(args),
    count: (r) => ((r as { duplicate?: boolean; replayed?: boolean }).duplicate || (r as { replayed?: boolean }).replayed ? 0 : 1),
    ref: writeRef,
  },
  {
    name: 'create_note',
    title: 'Create a note',
    description:
      `Create a markdown note (title up to ${AGENT_WRITE_LIMITS.titleChars} characters, body up to ${AGENT_WRITE_LIMITS.noteBodyChars}), optionally in a space. For ongoing project context, create one note per project and add to it later with append_to_note instead of making new notes. Returns its id.`,
    access: 'write',
    inputSchema: z.object({
      title: z.string().min(1).max(AGENT_WRITE_LIMITS.titleChars).describe('The note title, e.g. "memex: project context"'),
      body: z.string().max(AGENT_WRITE_LIMITS.noteBodyChars).optional().describe('Markdown'),
      space_id: writeSpace.optional(),
      idempotency_key: idempotencyKey.optional(),
    }),
    run: ({ writes }, args) => unwrap(writes).createNote(args),
    count: created,
    ref: writeRef,
  },
  {
    name: 'create_task',
    title: 'Create a task',
    description: 'Add a to-do to the user\'s tasks, optionally with detail, a due date and a space. Returns its id. To complete or change an existing task, use propose_change.',
    access: 'write',
    inputSchema: z.object({
      text: z.string().min(1).max(AGENT_WRITE_LIMITS.titleChars).describe('The task, one line'),
      detail: z.string().max(AGENT_WRITE_LIMITS.taskDetailChars).optional().describe('More detail, plain text'),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD'),
      space_id: writeSpace.optional(),
      idempotency_key: idempotencyKey.optional(),
    }),
    run: ({ writes }, args) => unwrap(writes).createTask(args),
    count: created,
    ref: writeRef,
  },
  {
    name: 'append_to_note',
    title: 'Append to a note',
    description:
      `Add markdown (up to ${AGENT_WRITE_LIMITS.appendChars} characters) to the end of a note, after a blank line. Applied at once if the note was created by this client (mode "appended"); for any other note it becomes an Inbox proposal the user approves (mode "proposed"). Start entries with a date, e.g. "### 2026-11-01".`,
    access: 'write',
    inputSchema: z.object({
      note_id: z.uuid().describe('The note id (from create_note, search or get_item)'),
      text: z.string().min(1).max(AGENT_WRITE_LIMITS.appendChars).describe('Markdown to add at the end'),
      reason: z.string().max(AGENT_WRITE_LIMITS.reasonChars).optional().describe('Shown to the user if this becomes a proposal'),
      idempotency_key: idempotencyKey.optional(),
    }),
    run: ({ writes }, args) => unwrap(writes).appendToNote(args),
    count: (r) => ((r as { replayed?: boolean }).replayed ? 0 : 1),
    ref: writeRef,
  },
  {
    name: 'propose_change',
    title: 'Propose a change',
    description:
      'Ask the user to change an existing link, note or task: action "file" puts it into a space (space_id); action "edit" changes its title, text (note body, task detail, link description: the full new text), due_date (tasks; null clears) or done (tasks). Nothing changes until the user approves it in their Inbox; you get a proposal_id back. Jots can\'t be changed.',
    access: 'write',
    inputSchema: z.object({
      type: z.enum(PROPOSAL_ITEM_TYPES).describe('link, note or task'),
      id: z.uuid().describe('The item id'),
      action: z.enum(['file', 'edit']).describe('"file" into a space, or "edit" fields'),
      space_id: z.uuid().optional().describe('For "file": the space id from list_spaces'),
      changes: z
        .object({
          title: z.string().min(1).max(AGENT_WRITE_LIMITS.linkTitleChars).optional(),
          text: z.string().max(AGENT_WRITE_LIMITS.noteMaxChars).optional().describe('The complete new text, not a patch'),
          due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
          done: z.boolean().optional(),
        })
        .strict()
        .optional()
        .describe('For "edit": only the fields to change'),
      reason: z.string().max(AGENT_WRITE_LIMITS.reasonChars).optional().describe('One line the user sees next to the proposal'),
      idempotency_key: idempotencyKey.optional(),
    }),
    run: ({ writes }, args) => unwrap(writes).proposeChange(args),
    count: (r) => ((r as { status?: string; replayed?: boolean }).status === 'pending' && !(r as { replayed?: boolean }).replayed ? 1 : 0),
    ref: writeRef,
  },
];
