/*
 * Calendar days in a named time zone, for the Journal and timeline tools.
 * Agents talk in days (`2026-11-01`); the database stores instants. These
 * turn one into the other with Intl only, so they run in Workers, Node,
 * browsers and Hermes alike.
 */
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

/** A real calendar day in `YYYY-MM-DD` form. */
export function isDay(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = DAY_RE.exec(value);
  if (!m) return false;
  const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return date.getUTCFullYear() === +m[1] && date.getUTCMonth() === +m[2] - 1 && date.getUTCDate() === +m[3];
}

/** An IANA zone name Intl understands (`UTC`, `America/New_York`). */
export function isTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();
const formatterFor = (timeZone: string) => {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
};

/** Wall-clock fields of an instant in a zone. */
function wallClock(ms: number, timeZone: string) {
  const parts: Record<string, number> = {};
  for (const p of formatterFor(timeZone).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  return parts as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Minutes the zone is ahead of UTC at an instant. */
function offsetMinutes(ms: number, timeZone: string): number {
  const w = wallClock(ms, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000);
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** The calendar day an instant falls on in a zone. */
export function dayOf(instant: string | number, timeZone: string): string {
  const ms = typeof instant === 'number' ? instant : Date.parse(instant);
  const w = wallClock(ms, timeZone);
  return `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}`;
}

/** Epoch ms of local midnight starting `day` in `timeZone`. */
export function dayStartMs(day: string, timeZone: string): number {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let start = guess - offsetMinutes(guess, timeZone) * 60_000;
  // Around a DST change the offset at midnight differs from the guess's.
  const again = offsetMinutes(start, timeZone);
  start = guess - again * 60_000;
  return start;
}

/** `day` shifted by whole days (calendar arithmetic, zone-free). */
export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Inclusive count of days from `from` to `to` (1 when equal). */
export function daySpan(from: string, to: string): number {
  const [a, b] = [from, to].map((day) => {
    const [y, m, d] = day.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / DAY_MS) + 1;
}

export type Bucket = 'day' | 'week' | 'month';

/** The first day of the bucket a day falls in (weeks start on Monday). */
export function bucketStart(day: string, bucket: Bucket): string {
  if (bucket === 'day') return day;
  if (bucket === 'month') return `${day.slice(0, 7)}-01`;
  const [y, m, d] = day.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(day, -((weekday + 6) % 7));
}
