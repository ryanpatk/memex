/*
 * Text rules for agent reads: how a query becomes search terms, and the size
 * caps that keep every tool result small enough for a model's context.
 */

export const AGENT_LIMITS = {
  /** search / space_overview page size. */
  pageDefault: 20,
  pageMax: 50,
  /** get_journal page size (a day can be busy). */
  journalPageDefault: 50,
  journalPageMax: 100,
  /** get_journal / timeline_stats day ranges. */
  journalRangeDays: 92,
  statsRangeDays: 731,
  statsDayBuckets: 366,
  /** Rows counted per type by timeline_stats before it reports `truncated`. */
  statsRowsPerType: 5000,
  recentMax: 25,
  queryChars: 200,
  maxTerms: 6,
  termChars: 64,
  titleChars: 300,
  excerptChars: 280,
  /** get_item: longer note bodies come back cut, with `text_truncated: true`. */
  fullTextChars: 20_000,
  /** Rows a store is asked for per scan when the service post-filters (source). */
  scanBatch: 100,
  maxScans: 5,
} as const;

/**
 * Words to match. Case-insensitive; every word must appear in some field.
 * Wildcards and escapes (`*`, `%`, `\`) are dropped, so a query can't widen
 * itself; duplicates go, and at most `maxTerms` words of `termChars` count.
 */
export function searchTerms(query: string): string[] {
  const words = query
    .slice(0, AGENT_LIMITS.queryChars)
    // eslint-disable-next-line no-control-regex
    .replace(/[*%\\\u0000-\u001f\u007f]/g, ' ')
    .split(/\s+/)
    .map((w) => w.slice(0, AGENT_LIMITS.termChars).toLowerCase())
    .filter(Boolean);
  return [...new Set(words)].slice(0, AGENT_LIMITS.maxTerms);
}

/** Every term appears in at least one of the fields (the store contract, for in-memory stores). */
export const matchesTerms = (fields: (string | null | undefined)[], terms: string[]) => {
  const haystacks = fields.filter((f): f is string => !!f).map((f) => f.toLowerCase());
  return terms.every((t) => haystacks.some((h) => h.includes(t)));
};

/** Cut to `max` characters on a word boundary when one is near, marking the cut with `…`. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.8 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** First non-empty line, for jots' titles. */
export const firstLine = (text: string) => text.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
