import { hostOf } from '../sources';
import { entryText, type Entry, type FileableEntry, type JournalSpace } from './feed';

export type Suggestion = { space: JournalSpace; reason: string };

/* Filing suggestions (decision 13) */

/*
 * Five rules: unfiled is a finished state; suggest only when likely right,
 * always with a reason; the Inbox counts waiting suggestions only; "File to…"
 * everywhere; filing one save from a burst lights up its neighbours (falls
 * out of the time signal). Signals, strongest first: a space named in the
 * text, where links from that site usually go, what you filed within 20
 * minutes, similar title words. Measured on real data 2026-10-24: about 2 in
 * 3 filed links would have got a correct guess.
 */

const BURST_MS = 20 * 60_000;
/** Sites where the host says nothing about the topic. */
const AGGREGATOR_HOSTS = new Set(['x.com', 'twitter.com', 'youtube.com', 'youtu.be', 'pinterest.com', 'pin.it', 'reddit.com', 'github.com']);
const STOP = new Set(
  'the a an and or of to in on for with from by is are be at as it this that your you how what why new vs via com www http https html'.split(' '),
);

const words = (text: string) => [
  ...new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  ),
];

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface Filer {
  suggest: (entry: Entry) => Suggestion | undefined;
}

export const createFiler = (entries: Entry[], spaces: JournalSpace[]): Filer => {
  const byId = new Map(spaces.map((s) => [s.id, s]));
  const filed = entries.filter((e) => e.spaces.length > 0);

  // Same-site votes (links only, aggregators excluded)
  const hostVotes = new Map<string, Map<string, number>>();
  filed.forEach((e) => {
    if (e.kind !== 'link') return;
    const host = hostOf(e.link.url);
    if (AGGREGATOR_HOSTS.has(host)) return;
    const votes = hostVotes.get(host) ?? new Map<string, number>();
    e.spaces.forEach((s) => votes.set(s.id, (votes.get(s.id) ?? 0) + 1));
    hostVotes.set(host, votes);
  });

  // Filed entries by time, for the burst signal (jots written in a space count)
  const byTime = filed.map((e) => ({ t: new Date(e.at).getTime(), e })).sort((a, b) => a.t - b.t);
  /**
   * The space a save's burst belongs to: what you filed within 20 minutes
   * either side. Needs two neighbours agreeing (60%+ of the filed ones), or a
   * single neighbour within 5 minutes; one stray neighbour isn't enough.
   */
  const burstSpace = (entry: Entry) => {
    const t = new Date(entry.at).getTime();
    let lo = 0;
    let hi = byTime.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (byTime[mid].t < t - BURST_MS) lo = mid + 1;
      else hi = mid;
    }
    const tally = new Map<string, { n: number; closest: number; viaJot: boolean }>();
    let filedNear = 0;
    for (let i = lo; i < byTime.length && byTime[i].t <= t + BURST_MS; i++) {
      const c = byTime[i];
      if (c.e.id === entry.id) continue;
      filedNear += 1;
      const gap = Math.abs(c.t - t);
      c.e.spaces.forEach((sp) => {
        const cur = tally.get(sp.id) ?? { n: 0, closest: Infinity, viaJot: false };
        tally.set(sp.id, { n: cur.n + 1, closest: Math.min(cur.closest, gap), viaJot: cur.viaJot || c.e.kind === 'jot' });
      });
    }
    const top = [...tally].sort((a, b) => b[1].n - a[1].n || a[1].closest - b[1].closest)[0];
    if (!top) return undefined;
    const [spaceId, { n, closest, viaJot }] = top;
    const agreed = n >= 2 && n / filedNear >= 0.6;
    const tight = n === 1 && filedNear === 1 && closest <= 5 * 60_000;
    if (!agreed && !tight) return undefined;
    const space = byId.get(spaceId);
    return space && { space, n, viaJot };
  };

  // Title words: tf-idf vectors over filed items, nearest three vote
  const docs = filed
    .filter((e) => e.kind !== 'jot')
    .map((e) => ({ e, w: words(entryText(e)) }))
    .filter((d) => d.w.length > 0);
  const df = new Map<string, number>();
  docs.forEach((d) => d.w.forEach((w) => df.set(w, (df.get(w) ?? 0) + 1)));
  const idf = (w: string) => Math.log((docs.length + 1) / ((df.get(w) ?? 0) + 1));
  const vec = (ws: string[]) => new Map(ws.map((w) => [w, idf(w)]));
  const norm = (v: Map<string, number>) => Math.sqrt([...v.values()].reduce((a, x) => a + x * x, 0));
  const vectors = docs.map((d) => {
    const v = vec(d.w);
    return { e: d.e, v, n: norm(v) };
  });
  const similar = (entry: Entry) => {
    const v = vec(words(entryText(entry)));
    const n = norm(v);
    if (!n) return undefined;
    const sims = vectors
      .filter((o) => o.e.id !== entry.id && o.n)
      .map((o) => {
        let dot = 0;
        v.forEach((x, k) => {
          const y = o.v.get(k);
          if (y) dot += x * y;
        });
        return { o, s: dot / (n * o.n) };
      })
      .filter((x) => x.s > 0.15)
      .sort((a, b) => b.s - a.s)
      .slice(0, 3);
    const tally = new Map<string, number>();
    sims.forEach(({ o, s }) => o.e.spaces.forEach((sp) => tally.set(sp.id, (tally.get(sp.id) ?? 0) + s)));
    const top = [...tally].sort((a, b) => b[1] - a[1])[0];
    return top && top[1] > 0.5 ? byId.get(top[0]) : undefined;
  };

  const namePatterns = spaces
    .filter((s) => s.name.trim().length > 2)
    .map((s) => ({ s, re: new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(s.name.trim())}($|[^\\p{L}\\p{N}])`, 'iu') }));

  const cache = new Map<string, Suggestion | null>();

  const compute = (entry: Entry): Suggestion | undefined => {
    if (entry.kind === 'jot' || entry.spaces.length) return undefined;

    const named = namePatterns.find(({ re }) => re.test(entryText(entry)));
    if (named) return { space: named.s, reason: `Mentions “${named.s.name}”` };

    if (entry.kind === 'link') {
      const host = hostOf(entry.link.url);
      const votes = [...(hostVotes.get(host) ?? new Map<string, number>())].sort((a, b) => b[1] - a[1]);
      const total = votes.reduce((a, [, n]) => a + n, 0);
      const top = votes[0];
      const space = top && byId.get(top[0]);
      if (space && top[1] >= 2 && top[1] / total >= 0.6) {
        return { space, reason: `${top[1]} other links from ${host} are in ${space.name}` };
      }
    }

    const burst = burstSpace(entry);
    if (burst) {
      const { space, n, viaJot } = burst;
      const reason =
        n >= 2
          ? `Saved alongside ${n} things you put in ${space.name}`
          : viaJot
            ? `You were writing in ${space.name} just then`
            : `Saved right after something in ${space.name}`;
      return { space, reason };
    }

    const like = similar(entry);
    if (like) return { space: like, reason: `Similar to other things in ${like.name}` };
    return undefined;
  };

  return {
    suggest: (entry) => {
      const hit = cache.get(entry.id);
      if (hit !== undefined) return hit ?? undefined;
      const result = compute(entry);
      cache.set(entry.id, result ?? null);
      return result;
    },
  };
};

const INBOX_WINDOW_MS = 30 * 86_400_000;

/** The Inbox: recent unfiled items that have a suggestion waiting, newest first. */
export const inboxOf = (entries: Entry[], filer: Filer, now = Date.now()) =>
  entries
    .filter((e): e is FileableEntry => e.kind !== 'jot' && e.spaces.length === 0 && now - new Date(e.at).getTime() < INBOX_WINDOW_MS)
    .map((entry) => ({ entry, suggestion: filer.suggest(entry) }))
    .filter((x): x is { entry: FileableEntry; suggestion: Suggestion } => Boolean(x.suggestion))
    .reverse();
