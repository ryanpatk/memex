import type { AgentToken, InboxProposal, Link, Note, Profile, SavedView, SelfMessage, Tag, Task } from '../types';
import type { MemoryData } from './repository';

/*
 * Demo data for the memory Repository: a believable, made-up person's
 * Library (a kitchen renovation, a Kyoto trip, a job search) with saves from
 * X, Pinterest and YouTube. Safe for screenshots: nothing here is real.
 * Pictures are generated SVGs, so it works offline. Dates are relative to
 * `now`, so Today / This week always have something in them.
 */

const USER = 'demo-user';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** A soft two-hue gradient with a couple of shapes, as a data URI. */
const picture = (hueA: number, hueB: number, shape: 'sun' | 'arch' | 'hills' | 'grid' | 'leaf', ratio = 1.25) => {
  const w = 800;
  const h = Math.round(w * ratio);
  const a = `oklch(0.86 0.07 ${hueA})`;
  const b = `oklch(0.62 0.11 ${hueB})`;
  const ink = `oklch(0.42 0.08 ${hueB})`;
  const shapes: Record<typeof shape, string> = {
    sun: `<circle cx="${w * 0.62}" cy="${h * 0.38}" r="${w * 0.2}" fill="${a}" opacity=".9"/><rect y="${h * 0.66}" width="${w}" height="${h * 0.34}" fill="${ink}" opacity=".55"/>`,
    arch: `<path d="M${w * 0.25} ${h}V${h * 0.45}a${w * 0.25} ${w * 0.25} 0 0 1 ${w * 0.5} 0V${h}Z" fill="${a}" opacity=".85"/><circle cx="${w * 0.5}" cy="${h * 0.42}" r="${w * 0.06}" fill="${ink}" opacity=".6"/>`,
    hills: `<path d="M0 ${h * 0.7}Q${w * 0.3} ${h * 0.45} ${w * 0.6} ${h * 0.68}T${w} ${h * 0.6}V${h}H0Z" fill="${ink}" opacity=".5"/><path d="M0 ${h * 0.82}Q${w * 0.4} ${h * 0.62} ${w} ${h * 0.8}V${h}H0Z" fill="${a}" opacity=".7"/>`,
    grid: Array.from({ length: 9 }, (_, i) => `<rect x="${w * 0.18 + (i % 3) * w * 0.22}" y="${h * 0.22 + Math.floor(i / 3) * w * 0.22}" width="${w * 0.18}" height="${w * 0.18}" rx="${w * 0.03}" fill="${i % 2 ? a : ink}" opacity=".75"/>`).join(''),
    leaf: `<ellipse cx="${w * 0.5}" cy="${h * 0.5}" rx="${w * 0.22}" ry="${h * 0.32}" transform="rotate(28 ${w * 0.5} ${h * 0.5})" fill="${ink}" opacity=".55"/><path d="M${w * 0.36} ${h * 0.76}L${w * 0.64} ${h * 0.24}" stroke="${a}" stroke-width="10" stroke-linecap="round"/>`,
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/>${shapes[shape]}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

/** A round favicon with one letter. */
const favicon = (letter: string, hue: number) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="oklch(0.55 0.12 ${hue})"/><text x="16" y="21.5" font-family="system-ui,sans-serif" font-size="16" font-weight="700" fill="white" text-anchor="middle">${letter}</text></svg>`,
  )}`;

export const createDemoData = (nowMs: number = Date.now()): MemoryData => {
  const ago = (ms: number) => new Date(nowMs - ms).toISOString();
  const stamp = (ms: number) => ({ created_at: ago(ms), updated_at: ago(ms) });

  const spaces: Profile[] = [
    { id: 'sp-kitchen', user_id: USER, name: 'Kitchen reno', ...stamp(60 * DAY) },
    { id: 'sp-kyoto', user_id: USER, name: 'Kyoto trip', ...stamp(50 * DAY) },
    { id: 'sp-jobs', user_id: USER, name: 'Job search', ...stamp(40 * DAY) },
    { id: 'sp-reading', user_id: USER, name: 'Reading', ...stamp(30 * DAY) },
  ];

  const tags: Tag[] = [
    { id: 'tg-inspo', user_id: USER, name: 'inspiration', color: '#e79c45', ...stamp(60 * DAY) },
    { id: 'tg-howto', user_id: USER, name: 'how-to', color: '#3d8fd6', ...stamp(60 * DAY) },
  ];

  type Seed = Omit<Link, 'user_id' | 'project_id' | 'order_index' | 'created_at' | 'updated_at'> & { at: number; edited?: number };
  const X = favicon('X', 260);
  const P = favicon('P', 20);
  const Y = favicon('▶', 25);
  const seeds: Seed[] = [
    { id: 'ln-1', at: 2 * HOUR, url: 'https://www.pinterest.com/pin/880453', source: 'pinterest:save', title: 'Warm oak open shelving over a zellige backsplash', favicon_url: P, preview_image_url: picture(70, 40, 'grid', 1.4) },
    { id: 'ln-2', at: 3 * HOUR, url: 'https://x.com/softhardware/status/1852', source: 'x:bookmark', title: 'Interfaces should feel like objects you can pick up, not paper you squint at', description: 'A thread on tactile UI, with examples from late-2000s console menus.', favicon_url: X },
    { id: 'ln-3', at: 5 * HOUR, url: 'https://www.youtube.com/watch?v=joinery01', title: 'How Japanese joinery holds a house together without nails', favicon_url: Y, preview_image_url: picture(55, 30, 'arch', 0.5625) },
    { id: 'ln-4', at: 9 * HOUR, url: 'https://kyoto.travel/en/autumn-walks', title: 'Kyoto in autumn: a two-day walking route through Higashiyama', description: 'From Kiyomizu-dera down to Gion, with tea stops.', preview_image_url: picture(30, 15, 'hills', 0.66) },
    { id: 'ln-5', at: 1 * DAY + 2 * HOUR, url: 'https://www.pinterest.com/pin/771022', source: 'pinterest:save', title: 'Terrazzo floor with brass inlay strips', favicon_url: P, preview_image_url: picture(85, 50, 'grid', 1.2) },
    { id: 'ln-6', at: 1 * DAY + 6 * HOUR, url: 'https://calmtech.com/', title: 'Calm Technology: principles for tools that respect attention', description: 'Technology should require the smallest possible amount of attention.' },
    { id: 'ln-7', at: 2 * DAY, url: 'https://x.com/typecrit/status/1849', source: 'x:bookmark', title: 'The only three typeface pairings you need for product UI', favicon_url: X, preview_image_url: picture(260, 290, 'leaf', 0.75) },
    { id: 'ln-8', at: 2 * DAY + 5 * HOUR, url: 'https://www.youtube.com/watch?v=limeplaster', title: 'Plastering a lime wall, start to finish (no music)', favicon_url: Y, preview_image_url: picture(90, 70, 'sun', 0.5625) },
    { id: 'ln-9', at: 3 * DAY, url: 'https://www.pinterest.com/pin/662290', source: 'pinterest:save', title: 'Moss garden at Gio-ji, early morning', favicon_url: P, preview_image_url: picture(140, 160, 'leaf', 1.5) },
    { id: 'ln-10', at: 3 * DAY + 4 * HOUR, url: 'https://www.inkandswitch.com/local-first/', title: 'Local-first software: you own your data, in spite of the cloud', description: 'Seven ideals for software that keeps working when the company is gone.' },
    { id: 'ln-11', at: 4 * DAY, url: 'https://jobs.example.com/design/staff-product-designer', title: 'Staff Product Designer, Tools & Platform', description: 'Remote, full-time. Design system ownership and craft.' },
    { id: 'ln-12', at: 5 * DAY, url: 'https://www.pinterest.com/pin/559108', source: 'pinterest:save', title: 'Paper lanterns over a long dining table', favicon_url: P, preview_image_url: picture(60, 25, 'sun', 1.3) },
    { id: 'ln-13', at: 6 * DAY, url: 'https://x.com/ceramicsdaily/status/1840', source: 'x:bookmark', title: 'Five celadon glaze recipes that actually work at cone 6', favicon_url: X, preview_image_url: picture(170, 190, 'arch', 1) },
    { id: 'ln-14', at: 8 * DAY, url: 'https://www.youtube.com/watch?v=wiimenu', title: 'Why the Wii menu still feels good: a design retrospective', favicon_url: Y, preview_image_url: picture(230, 250, 'grid', 0.5625) },
    { id: 'ln-15', at: 10 * DAY, url: 'https://www.thisoldhouse.com/walls/lime-plaster-vs-drywall', title: 'Lime plaster vs. drywall: cost, feel and repair', preview_image_url: picture(75, 55, 'hills', 0.66) },
    { id: 'ln-16', at: 12 * DAY, url: 'https://www.pinterest.com/pin/448812', source: 'pinterest:save', title: 'Ryokan entry with a stone step and noren curtain', favicon_url: P, preview_image_url: picture(35, 20, 'arch', 1.45) },
    { id: 'ln-17', at: 15 * DAY, url: 'https://x.com/pmcraft/status/1830', source: 'x:bookmark', title: 'How I structure a portfolio case study in five slides', favicon_url: X },
    { id: 'ln-18', at: 20 * DAY, url: 'https://www.youtube.com/watch?v=brewratios', title: 'Pour-over: four brew ratios tasted side by side', favicon_url: Y, preview_image_url: picture(45, 30, 'sun', 0.5625) },
    { id: 'ln-19', at: 26 * DAY, url: 'https://www.japan-guide.com/e/e3900.html', title: 'Arashiyama bamboo grove: when to go to beat the crowds' },
    { id: 'ln-20', at: 34 * DAY, url: 'https://www.pinterest.com/pin/330017', source: 'pinterest:save', title: 'Fluted kitchen island in sage green', favicon_url: P, preview_image_url: picture(150, 130, 'grid', 1.25) },
    { id: 'ln-21', at: 45 * DAY, url: 'https://read.example.org/essays/the-desk', title: 'The desk as an instrument: notes on working memory', description: 'An essay on keeping thinking visible.' },
  ];
  const links: Link[] = seeds.map(({ at, edited, ...rest }, index) => ({
    ...rest,
    user_id: USER,
    project_id: 'library',
    order_index: index,
    created_at: ago(at),
    updated_at: ago(edited ?? at),
    is_super_favorite: rest.id === 'ln-6' || rest.id === 'ln-10',
  }));

  const notes: Note[] = [
    { id: 'nt-1', user_id: USER, title: 'Kitchen measurements', body: '- Back wall: 3.42 m\n- Window sill height: 1.05 m\n- Island: 2.4 × 0.9 m, 1 m clearance all round\n\nAsk about the soffit before ordering cabinets.', order_index: 0, created_at: ago(9 * DAY), updated_at: ago(4 * HOUR) },
    { id: 'nt-2', user_id: USER, title: 'Portfolio walkthrough script', body: 'Open with the problem, not the screens. Three projects, eight minutes each.\n\n1. memex — the Journal\n2. Design system migration\n3. Onboarding rewrite', order_index: 1, created_at: ago(6 * DAY), updated_at: ago(1 * DAY + 3 * HOUR) },
    { id: 'nt-3', user_id: USER, title: 'Kyoto day 2', body: 'Morning: Fushimi Inari before 7.\nLunch: Nishiki market.\nAfternoon: Gio-ji moss garden, Arashiyama.\nEvening: Pontocho.', order_index: 2, created_at: ago(11 * DAY), updated_at: ago(2 * DAY + 2 * HOUR) },
    { id: 'nt-4', user_id: USER, title: 'Calm Technology — reading notes', body: 'Tech should inform without demanding focus. Make the periphery do the work.\n\n> The right amount of technology is the minimum needed to solve the problem.', order_index: 3, captured_by: 'agent', captured_client: 'Grok Bot: reading', created_at: ago(1 * DAY + 5 * HOUR), updated_at: ago(1 * DAY + 4 * HOUR) },
    { id: 'nt-5', user_id: USER, title: 'Gift ideas', body: 'Celadon cups for Mum. A good pour-over kettle. Linen napkins.', order_index: 4, created_at: ago(18 * DAY), updated_at: ago(18 * DAY) },
  ];

  const tasks: Task[] = [
    { id: 'tk-1', user_id: USER, title: 'Order three tile samples', is_done: false, order_index: 0, ...stamp(3 * HOUR) },
    { id: 'tk-2', user_id: USER, title: 'Send portfolio link to the recruiter', is_done: false, order_index: 1, ...stamp(1 * DAY) },
    { id: 'tk-3', user_id: USER, title: 'Book the ryokan in Higashiyama', is_done: true, order_index: 2, created_at: ago(9 * DAY), updated_at: ago(2 * DAY) },
    { id: 'tk-4', user_id: USER, title: 'Call the electrician about the island outlet', is_done: false, order_index: 3, ...stamp(4 * DAY) },
    { id: 'tk-5', user_id: USER, title: 'Renew passport', is_done: true, order_index: 4, created_at: ago(30 * DAY), updated_at: ago(12 * DAY) },
  ];

  const jots: SelfMessage[] = [
    { id: 'jt-1', user_id: USER, profile_id: null, body: 'The island should be one material, not two.', ...stamp(5 * HOUR) },
    { id: 'jt-2', user_id: USER, profile_id: null, body: 'Ask about lime plaster in the hallway too', ...stamp(2 * HOUR) },
  ];

  const spaceLinks = [
    ['sp-kitchen', 'ln-1'], ['sp-kitchen', 'ln-5'], ['sp-kitchen', 'ln-8'], ['sp-kitchen', 'ln-15'], ['sp-kitchen', 'ln-20'], ['sp-kitchen', 'ln-12'],
    ['sp-kyoto', 'ln-4'], ['sp-kyoto', 'ln-9'], ['sp-kyoto', 'ln-16'], ['sp-kyoto', 'ln-19'], ['sp-kyoto', 'ln-3'],
    ['sp-jobs', 'ln-11'], ['sp-jobs', 'ln-17'],
    ['sp-reading', 'ln-6'], ['sp-reading', 'ln-10'], ['sp-reading', 'ln-21'], ['sp-reading', 'ln-2'],
  ].map(([profile_id, link_id]) => ({ profile_id, link_id, is_super_favorite: link_id === 'ln-15' }));

  const spaceNotes = [
    ['sp-kitchen', 'nt-1'], ['sp-jobs', 'nt-2'], ['sp-kyoto', 'nt-3'], ['sp-reading', 'nt-4'],
  ].map(([profile_id, note_id]) => ({ profile_id, note_id }));

  const spaceTasks = [
    ['sp-kitchen', 'tk-1'], ['sp-jobs', 'tk-2'], ['sp-kyoto', 'tk-3'], ['sp-kitchen', 'tk-4'],
  ].map(([profile_id, task_id]) => ({ profile_id, task_id }));

  const views: SavedView[] = [
    {
      id: 'vw-kitchen',
      user_id: USER,
      name: 'Kitchen moodboard',
      definition: { filters: { sources: ['pinterest'], spaces: ['sp-kitchen'] }, layout: 'grid' },
      position: 0,
      ...stamp(7 * DAY),
    },
    {
      id: 'vw-queue',
      user_id: USER,
      name: 'Reading queue',
      definition: {
        filters: { types: ['link'], spaces: ['unfiled'] },
        sort: { field: 'saved', direction: 'desc' },
        layout: 'table',
      },
      position: 1,
      ...stamp(5 * DAY),
    },
  ];

  // An agent at work (MCP, docs/mcp.md): one token and three proposals waiting in the Inbox.
  const agentTokens: AgentToken[] = [
    { id: 'at-1', client_name: 'Grok Bot: reading', scope: 'read_write', created_at: ago(20 * DAY), expires_at: new Date(nowMs + 70 * DAY).toISOString(), revoked_at: null, last_used_at: ago(1 * DAY + 4 * HOUR) },
    { id: 'at-2', client_name: 'Claude Code', scope: 'read', created_at: ago(40 * DAY), expires_at: null, revoked_at: ago(10 * DAY), last_used_at: ago(12 * DAY) },
  ];
  const proposal = (p: Pick<InboxProposal, 'id' | 'kind' | 'item_type' | 'item_id' | 'changes'> & Partial<InboxProposal>, at: number): InboxProposal => ({
    user_id: USER,
    token_id: 'at-1',
    client_name: 'Grok Bot: reading',
    space_id: null,
    reason: null,
    base_updated_at: ago(at + HOUR),
    status: 'pending',
    decided_at: null,
    created_at: ago(at),
    ...p,
  });
  const proposals: InboxProposal[] = [
    proposal({ id: 'pr-1', kind: 'file', item_type: 'link', item_id: 'ln-14', space_id: 'sp-reading', changes: {}, reason: 'A design retrospective, like the rest of Reading' }, 3 * HOUR),
    proposal({ id: 'pr-2', kind: 'append', item_type: 'note', item_id: 'nt-1', changes: { text: '- Soffit: 30 cm drop above the window (from the builder’s email)' }, reason: 'Adds the soffit size you asked about' }, 2 * HOUR),
    proposal({ id: 'pr-3', kind: 'edit', item_type: 'task', item_id: 'tk-4', changes: { title: 'Call the electrician about the island outlet and the pendant circuit', due_date: new Date(nowMs + 3 * DAY).toISOString().slice(0, 10) }, base_updated_at: ago(4 * DAY) }, 1 * HOUR),
  ];

  return {
    user: { id: USER, email: 'demo@memex.local', user_metadata: { full_name: 'Demo' } },
    links,
    notes,
    tasks,
    tags,
    spaces,
    jots,
    linkTags: [['tg-inspo', 'ln-1'], ['tg-inspo', 'ln-12'], ['tg-howto', 'ln-8']],
    noteTags: [],
    taskTags: [],
    spaceLinks,
    spaceNotes,
    spaceTasks,
    views,
    agentTokens,
    proposals,
  };
};
