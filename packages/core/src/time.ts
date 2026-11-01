/*
 * Intl.RelativeTimeFormat is missing on some runtimes (Hermes, React Native's
 * engine), so it's created on first use and falls back to plain English.
 */
type RelativeUnit = 'minute' | 'hour' | 'day';
let rtf: { format(value: number, unit: RelativeUnit): string } | undefined;

/** English relative time without Intl: "in 2 hours", "3 days ago", "yesterday". */
export const formatRelativeFallback = (value: number, unit: RelativeUnit): string => {
  if (unit === 'day' && value === -1) return 'yesterday';
  if (unit === 'day' && value === 1) return 'tomorrow';
  if (value === 0) return unit === 'day' ? 'today' : `this ${unit}`;
  const n = Math.abs(value);
  const words = `${n} ${unit}${n === 1 ? '' : 's'}`;
  return value < 0 ? `${words} ago` : `in ${words}`;
};

const relative = (value: number, unit: RelativeUnit) => {
  if (!rtf) {
    const Rtf = (Intl as { RelativeTimeFormat?: typeof Intl.RelativeTimeFormat }).RelativeTimeFormat;
    rtf = Rtf ? new Rtf(undefined, { numeric: 'auto' }) : { format: formatRelativeFallback };
  }
  return rtf.format(value, unit);
};
const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const shortDateYear = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

/** "5 minutes ago", "yesterday", "Oct 8", "Mar 3, 2024". */
export const relativeTime = (iso: string, now = Date.now()) => {
  const then = new Date(iso).getTime();
  const seconds = (then - now) / 1000;
  const abs = Math.abs(seconds);
  if (abs < 60) return 'just now';
  if (abs < 3600) return relative(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return relative(Math.round(seconds / 3600), 'hour');
  if (abs < 86400 * 7) return relative(Math.round(seconds / 86400), 'day');
  const date = new Date(iso);
  return date.getFullYear() === new Date(now).getFullYear()
    ? shortDate.format(date)
    : shortDateYear.format(date);
};

/** Task due dates are stored as YYYY-MM-DD; read them as local midnight, not UTC. */
export const dueDateIso = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;

export type TimeGroupLabel = 'Today' | 'This week' | 'This month' | 'Earlier';

const GROUP_ORDER: TimeGroupLabel[] = ['Today', 'This week', 'This month', 'Earlier'];

export const timeGroupFor = (iso: string, now = new Date()): TimeGroupLabel => {
  const date = new Date(iso);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const time = date.getTime();
  if (time >= startOfToday) return 'Today';
  if (time >= startOfToday - 6 * 86400000) return 'This week';
  if (time >= startOfToday - 30 * 86400000) return 'This month';
  return 'Earlier';
};

/** Group already-sorted items by recency bucket, preserving order. */
export const groupByTime = <T>(items: T[], getDate: (item: T) => string) => {
  const now = new Date();
  const map = new Map<TimeGroupLabel, T[]>();
  items.forEach((item) => {
    const label = timeGroupFor(getDate(item), now);
    const list = map.get(label);
    if (list) list.push(item);
    else map.set(label, [item]);
  });
  return GROUP_ORDER.filter((label) => map.has(label)).map((label) => ({
    label,
    items: map.get(label)!,
  }));
};

/** Local calendar day as YYYY-MM-DD. */
export const toDayKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const fromDayKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const shiftDay = (key: string, delta: number) => {
  const date = fromDayKey(key);
  date.setDate(date.getDate() + delta);
  return toDayKey(date);
};

export const dayKeyOf = (iso: string) => toDayKey(new Date(iso));
