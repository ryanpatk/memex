import { toDayKey, type InboxProposal, type LinkWithTag, type NoteWithTags, type Profile, type SelfMessage, type TaskWithTags } from '@memex/core';

/*
 * DEV-ONLY demo data for the fixture repository (fixtureRepository.ts).
 * Invented content, safe for screenshots and Ryan's public portfolio; never
 * real data, never shipped as a default (see ../repository.ts). Dates are
 * relative to `now` so the feed always shows Today / Yesterday.
 */

const USER = 'demo-user';

const at = (now: Date, daysAgo: number, hh: number, mm: number) =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, hh, mm).toISOString();

const picture = (seed: string, w = 600, h = 760) => `https://picsum.photos/seed/memex-${seed}/${w}/${h}`;
const favicon = (domain: string) => `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

export interface DemoData {
  spaces: Profile[];
  jots: SelfMessage[];
  links: LinkWithTag[];
  notes: NoteWithTags[];
  tasks: TaskWithTags[];
  /** An agent's changes waiting in the Inbox (MCP, docs/mcp.md). */
  proposals: InboxProposal[];
  membership: {
    links: { profile_id: string; link_id: string }[];
    notes: { profile_id: string; note_id: string }[];
    tasks: { profile_id: string; task_id: string }[];
  };
}

export const buildDemoData = (now = new Date()): DemoData => {
  const t = (d: number, h: number, m: number) => at(now, d, h, m);
  const space = (id: string, name: string, created: string): Profile => ({
    id,
    user_id: USER,
    name,
    created_at: created,
    updated_at: created,
  });
  const spaces = [
    space('studio', 'Studio', '2026-01-04T10:00:00.000Z'),
    space('kyoto', 'Kyoto trip', '2026-03-12T10:00:00.000Z'),
    space('reading', 'Reading', '2026-05-02T10:00:00.000Z'),
    space('home', 'Home', '2026-06-20T10:00:00.000Z'),
  ];

  const jot = (id: string, created_at: string, body: string, profile_id: string | null = null): SelfMessage => ({
    id,
    user_id: USER,
    profile_id,
    body,
    created_at,
    updated_at: created_at,
  });
  const jots = [
    jot('j1', t(3, 9, 12), 'Morning pages: the best tools feel like instruments, not dashboards.'),
    jot('j2', t(1, 8, 55), 'Idea: a jot that files itself when it mentions a space.', 'studio'),
    jot('j3', t(1, 21, 2), 'Pattern 159 — light on two sides of every room. Applies to screens too.', 'reading'),
    jot('j4', t(0, 7, 48), 'Coffee, then the phone app ☕️'),
    jot('j5', t(0, 10, 15), 'Remember: unfiled is a finished state.'),
  ];

  const link = (id: string, created_at: string, url: string, extra: Partial<LinkWithTag> = {}): LinkWithTag => ({
    id,
    project_id: 'library',
    user_id: USER,
    url,
    created_at,
    updated_at: created_at,
    order_index: 0,
    ...extra,
  });
  const links = [
    link('l1', t(3, 9, 40), 'https://frankchimero.com/blog/2012/the-shape-of-design/', {
      title: 'The Shape of Design',
      description: 'A book about the why of design, not the how.',
      favicon_url: favicon('frankchimero.com'),
    }),
    ...['moss', 'glaze', 'kiln', 'linen', 'stone'].map((seed, i) =>
      link(`p${i}`, t(1, 10, 10 + i * 2), `https://www.pinterest.com/pin/demo-${seed}/`, {
        title: ['Moss garden, Saihō-ji', 'Celadon glaze study', 'Anagama kiln at dusk', 'Washed linen palette', 'River stone forms'][i],
        source: 'pinterest:save',
        preview_image_url: picture(seed),
      }),
    ),
    link('l2', t(1, 12, 30), 'https://calmtech.com/', {
      title: 'Calm Technology',
      description: 'Principles for technology that respects attention.',
      favicon_url: favicon('calmtech.com'),
    }),
    ...['type', 'grid', 'motion'].map((seed, i) =>
      link(`x${i}`, t(0, 8, 20 + i), `https://x.com/demo/status/${1000 + i}`, {
        title: ['A tiny type scale that holds up at every size', 'Grids are a promise to the reader', 'Motion should explain, not decorate'][i],
        source: 'x:bookmark',
        preview_image_url: picture(`x-${seed}`, 800, 600),
      }),
    ),
    link('y1', t(0, 9, 5), 'https://www.youtube.com/watch?v=demo-joinery', {
      title: 'Japanese joinery, no nails',
      preview_image_url: picture('joinery', 960, 540),
    }),
    link('l3', t(0, 9, 50), 'https://www.are.na/blog/the-library-of-babel', {
      title: 'Notes on a personal library, for the reading pile',
      favicon_url: favicon('are.na'),
    }),
    // Older saves, one platform at a time (no runs), so the Library has a few pages.
    ...(
      [
        ['o1', 4, 'https://www.pinterest.com/pin/demo-tatami/', 'Tatami room, paper screens, late light', 'pinterest:save', 600, 800],
        ['o2', 4, 'https://www.youtube.com/watch?v=demo-woodblock', 'Woodblock printing in one take', null, 960, 540],
        ['o3', 5, 'https://x.com/demo/status/2001', 'Small tools, sharp edges: notes on making software you can hold', 'x:bookmark', 800, 600],
        ['o4', 5, 'https://www.pinterest.com/pin/demo-indigo/', 'Indigo dye, three dips', 'pinterest:save', 600, 760],
        ['o5', 6, 'https://www.nngroup.com/articles/progressive-disclosure/', 'Progressive disclosure, revisited', null, 800, 500],
        ['o6', 6, 'https://www.youtube.com/watch?v=demo-kintsugi', 'Kintsugi: mending with gold', null, 960, 540],
        ['o7', 7, 'https://www.pinterest.com/pin/demo-ceramics/', 'Speckled stoneware mugs', 'pinterest:save', 600, 820],
        ['o8', 7, 'https://x.com/demo/status/2002', 'A good default is a design decision you never have to explain', 'x:bookmark', 800, 600],
        ['o9', 8, 'https://www.pinterest.com/pin/demo-garden/', 'Raked gravel, one stone', 'pinterest:save', 600, 780],
        ['o10', 8, 'https://www.kinfolk.com/slow-rooms/', 'Slow rooms: furniture that waits for you', null, 800, 520],
        ['o11', 9, 'https://www.youtube.com/watch?v=demo-bonsai', 'Repotting a 40-year-old juniper', null, 960, 540],
        ['o12', 9, 'https://www.pinterest.com/pin/demo-lantern/', 'Paper lanterns over a narrow street', 'pinterest:save', 600, 800],
      ] as const
    ).map(([id, days, url, title, source, w, h], i) =>
      link(id, t(days, i % 2 ? 19 : 11, 5 + i), url, {
        title,
        source: source ?? undefined,
        preview_image_url: picture(id, w, h),
      }),
    ),
  ];

  const note = (id: string, created_at: string, title: string, body: string): NoteWithTags => ({
    id,
    user_id: USER,
    title,
    body,
    order_index: 0,
    created_at,
    updated_at: created_at,
  });
  const notes = [
    note('n1', t(3, 13, 5), 'Kyoto — first draft itinerary', '## Day 1\nArashiyama at dawn, bamboo before the crowds. Tenryū-ji garden.\n\n## Day 2\nPhilosopher’s Path, Ginkaku-ji, tea in Okazaki.'),
    note('n2', t(0, 9, 30), 'Portfolio — memex case study', 'Problem: scattered capture. Approach: one Journal, files you own. Show the loop: capture → display → analysis.'),
  ];

  /** A due date `days` from today, as the YYYY-MM-DD day tasks store. */
  const due = (days: number) => toDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));
  const task = (id: string, created_at: string, title: string, is_done = false, due_date?: string): TaskWithTags => ({
    id,
    user_id: USER,
    title,
    is_done,
    due_date,
    order_index: 0,
    created_at,
    updated_at: created_at,
  });
  const tasks = [
    task('t1', t(3, 18, 20), 'Book the ryokan in Arashiyama', true),
    task('t5', t(4, 17, 30), 'Return the library books', false, due(-1)),
    task('t8', t(2, 15, 10), 'Send the deposit for the hallway paint', true),
    task('t4', t(2, 19, 40), 'Order film for the trip', false, due(5)),
    task('t2', t(1, 16, 45), 'Sketch the share sheet flow', false, due(1)),
    task('t3', t(0, 10, 2), 'Renew passport photos'),
    task('t6', t(0, 11, 20), 'Write the case study intro', false, due(0)),
    task('t7', t(0, 11, 40), 'Pick a colour for the hallway', false, due(12)),
  ];

  const proposal = (
    p: Pick<InboxProposal, 'id' | 'kind' | 'item_type' | 'item_id' | 'changes' | 'created_at'> & Partial<InboxProposal>,
  ): InboxProposal => ({
    user_id: USER,
    token_id: 'demo-agent',
    client_name: 'Grok Bot',
    space_id: null,
    reason: null,
    base_updated_at: null,
    status: 'pending',
    decided_at: null,
    ...p,
  });
  const proposals = [
    proposal({
      id: 'pr1',
      kind: 'file',
      item_type: 'link',
      item_id: 'o5',
      space_id: 'studio',
      changes: {},
      reason: 'A design reference, like the rest of Studio',
      created_at: t(0, 7, 5),
    }),
    proposal({
      id: 'pr2',
      kind: 'append',
      item_type: 'note',
      item_id: 'n1',
      changes: { text: '## Day 3\nNara by the early train; the deer park before nine.' },
      reason: 'Adds the Nara day you jotted about',
      base_updated_at: t(3, 13, 5),
      created_at: t(0, 7, 20),
    }),
    proposal({
      id: 'pr3',
      kind: 'edit',
      item_type: 'task',
      item_id: 't2',
      changes: { title: 'Sketch the share sheet flow: save and file in one step', due_date: due(3) },
      base_updated_at: t(1, 16, 45),
      created_at: t(0, 7, 40),
    }),
  ];

  return {
    spaces,
    jots,
    links,
    notes,
    tasks,
    proposals,
    membership: {
      links: [
        { profile_id: 'reading', link_id: 'l1' },
        { profile_id: 'studio', link_id: 'p0' },
        { profile_id: 'studio', link_id: 'p1' },
        { profile_id: 'reading', link_id: 'l2' },
        { profile_id: 'studio', link_id: 'x0' },
        { profile_id: 'home', link_id: 'y1' },
      ],
      notes: [
        { profile_id: 'kyoto', note_id: 'n1' },
        { profile_id: 'studio', note_id: 'n2' },
      ],
      tasks: [
        { profile_id: 'kyoto', task_id: 't1' },
        { profile_id: 'studio', task_id: 't2' },
        { profile_id: 'kyoto', task_id: 't3' },
        { profile_id: 'kyoto', task_id: 't4' },
        { profile_id: 'studio', task_id: 't6' },
        { profile_id: 'home', task_id: 't7' },
        { profile_id: 'home', task_id: 't8' },
      ],
    },
  };
};
