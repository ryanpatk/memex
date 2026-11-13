import type { Link, Note } from '../types';
import type { MemoryData } from './repository';

/*
 * A big made-up Library for performance checks (`VITE_MEMEX_FIXTURES=large`
 * in dev): the demo data plus `count` generated links and notes, spread over
 * the past two years, filed across the demo spaces. Deterministic (a seeded
 * generator), so before/after measurements compare like with like. Nothing
 * here is real. Photos come from the dev server (vite.config.ts →
 * memex-fixture-images), so this data only makes sense under `npm run dev`.
 */

const USER = 'demo-user';
const HOUR = 3_600_000;

/** mulberry32: a tiny seeded PRNG, so every run builds the same Library. */
const seeded = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const WORDS = [
  'kitchen', 'oak', 'lime', 'plaster', 'kyoto', 'garden', 'moss', 'ceramic', 'glaze', 'tile', 'brass', 'linen',
  'portfolio', 'interface', 'tactile', 'calm', 'local-first', 'notebook', 'essay', 'joinery', 'lantern', 'terrazzo',
  'walk', 'temple', 'tea', 'route', 'recipe', 'typeface', 'grid', 'motion', 'paper', 'desk', 'island', 'sage',
];

const HOSTS: { host: string; source?: string; image: number; letter: string; hue: number }[] = [
  { host: 'www.pinterest.com', source: 'pinterest', image: 0.95, letter: 'P', hue: 20 },
  { host: 'x.com', source: 'x', image: 0.5, letter: 'X', hue: 260 },
  { host: 'www.youtube.com', source: 'youtube', image: 1, letter: '▶', hue: 25 },
  { host: 'www.inkandswitch.com', image: 0.4, letter: 'I', hue: 300 },
  { host: 'read.example.org', image: 0.2, letter: 'R', hue: 140 },
  { host: 'kyoto.travel', image: 0.8, letter: 'K', hue: 60 },
];

const RATIOS = [0.5625, 0.66, 0.75, 1, 1.25, 1.4, 1.5];

/** A photo from the dev server's fixture images (vite.config.ts), unique per item so each one loads and decodes. */
const picture = (ratio: number, n: number) => `/__fixture-images/photo-${ratio}.jpg?n=${n}`;

const favicon = (letter: string, hue: number) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="oklch(0.55 0.12 ${hue})"/><text x="16" y="21.5" font-family="system-ui,sans-serif" font-size="16" font-weight="700" fill="white" text-anchor="middle">${letter}</text></svg>`,
  )}`;

/** Adds `count` generated items (about 5 links to 1 note) to a copy of `base`. */
export const withBulkItems = (base: MemoryData, count: number, nowMs: number = Date.now()): MemoryData => {
  const random = seeded(20261112);
  const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)];
  const phrase = (min: number, max: number) => {
    const length = min + Math.floor(random() * (max - min + 1));
    const words = Array.from({ length }, () => pick(WORDS));
    return words.join(' ').replace(/^./, (c) => c.toUpperCase());
  };
  const ago = (ms: number) => new Date(nowMs - ms).toISOString();
  const favicons = new Map(HOSTS.map((h) => [h.host, favicon(h.letter, h.hue)]));

  const links: Link[] = [];
  const notes: Note[] = [];
  const spaceLinks = [...base.spaceLinks];
  const spaceNotes = [...base.spaceNotes];
  const linkTags = [...base.linkTags];
  const spaceIds = base.spaces.map((s) => s.id);
  const tagIds = base.tags.map((t) => t.id);

  for (let i = 0; i < count; i += 1) {
    // Spread over ~2 years, newest first, with a little jitter
    const at = (i + 1) * 7 * HOUR + Math.floor(random() * 5 * HOUR);
    if (i % 6 === 5) {
      const id = `bulk-nt-${i}`;
      notes.push({
        id,
        user_id: USER,
        title: random() < 0.15 ? '' : phrase(2, 6),
        body: Array.from({ length: 1 + Math.floor(random() * 4) }, () => `${phrase(6, 18)}.`).join('\n\n'),
        order_index: 100 + i,
        created_at: ago(at),
        updated_at: ago(at),
      });
      if (random() < 0.5) spaceNotes.push({ profile_id: pick(spaceIds), note_id: id });
      continue;
    }
    const host = pick(HOSTS);
    const id = `bulk-ln-${i}`;
    const hasImage = random() < host.image;
    links.push({
      id,
      user_id: USER,
      project_id: 'library',
      order_index: 100 + i,
      url: `https://${host.host}/${phrase(2, 4).toLowerCase().replace(/ /g, '-')}-${i}`,
      title: phrase(3, 14),
      description: random() < 0.5 ? `${phrase(8, 20)}.` : undefined,
      favicon_url: random() < 0.85 ? favicons.get(host.host) : undefined,
      preview_image_url: hasImage ? picture(pick(RATIOS), i) : undefined,
      source: host.source,
      created_at: ago(at),
      updated_at: ago(at),
    });
    if (random() < 0.6) spaceLinks.push({ profile_id: pick(spaceIds), link_id: id });
    if (tagIds.length && random() < 0.2) linkTags.push([pick(tagIds), id]);
  }

  return {
    ...base,
    links: [...base.links, ...links],
    notes: [...base.notes, ...notes],
    spaceLinks,
    spaceNotes,
    linkTags,
  };
};

/**
 * Reads a fixture mode's bulk size: `large` → 2,400 extra items, `large:5000`
 * → 5,000. Anything else → 0 (the plain demo data).
 */
export const bulkCountFor = (mode: string | undefined): number => {
  const match = /^large(?::(\d+))?$/.exec(mode ?? '');
  if (!match) return 0;
  return match[1] ? Math.min(20_000, Number(match[1])) : 2400;
};
