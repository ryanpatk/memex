/**
 * memex's MCP tools. Each one names the access it needs (`read` or `write`);
 * a token only sees and can call the tools its scope allows. The read tools
 * are thin wrappers over `createAgentReadService` (@memex/core/agent), which
 * does the validation, paging and size caps.
 *
 * M3-B adds write tools here with `access: 'write'`: `add_jot` writes
 * directly (captured_by = 'agent'); anything that would change existing data
 * becomes an Inbox proposal. No tool ever deletes or bulk-edits.
 */
import * as z from 'zod/v4';
import { AGENT_ITEM_TYPES, AGENT_LIMITS, AGENT_SOURCES, type AgentReadService, type ToolAccess } from '../../../packages/core/src/agent';

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
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const len = (value: any) => (Array.isArray(value) ? value.length : 0);

export const SERVER_INSTRUCTIONS = `memex is the user's personal working memory: one Journal of everything they save and write, filed into spaces.

Items come in four types:
- link: a saved web page or post (title, description, url, source: x, pinterest, youtube or web)
- note: a markdown document
- task: a to-do (done, due_date)
- jot: a short message in the Journal, like a note to self

A space is a project or context (a trip, a job search, a codebase). Items can sit in several spaces or none ("unfiled"). Tags are extra labels.

Using memex as project context:
1. list_spaces to find the space for the project, then space_overview for its counts and latest items.
2. search for words across titles, descriptions, note text and URLs; narrow with types, space_id, source or dates.
3. get_item to read one item in full (lists only carry excerpts).
4. get_journal for what happened on given days; timeline_stats for activity over time.

Lists are newest first (the Journal is oldest first) and paged: pass next_cursor back as cursor for more. Dates are YYYY-MM-DD days in the timezone you pass (default UTC). Every result is scoped to the token's owner. These tools only read; nothing here changes memex.`;

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
      `Read one link, note, task or jot in full: the whole note text (up to ${AGENT_LIMITS.fullTextChars} characters; text_truncated says if it was cut), task detail, link metadata, spaces and tags. Use the type and id from search, get_journal or space_overview.`,
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
];
