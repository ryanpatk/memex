import { describe, expect, it } from 'vitest';
import { formatRelativeFallback, relativeTime } from './time';

describe('relativeTime', () => {
  const now = new Date('2026-11-01T12:00:00Z').getTime();
  it('formats recent times relatively', () => {
    expect(relativeTime('2026-11-01T11:59:30Z', now)).toBe('just now');
    expect(relativeTime('2026-11-01T11:55:00Z', now)).toBe('5 minutes ago');
    expect(relativeTime('2026-10-31T12:00:00Z', now)).toBe('yesterday');
  });
});

describe('formatRelativeFallback (runtimes without Intl.RelativeTimeFormat, e.g. Hermes)', () => {
  it('matches Intl’s English output for the units core uses', () => {
    const intl = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    for (const [value, unit] of [
      [-5, 'minute'],
      [-1, 'minute'],
      [2, 'hour'],
      [-1, 'day'],
      [1, 'day'],
      [-3, 'day'],
      [0, 'day'],
    ] as const) {
      expect(formatRelativeFallback(value, unit)).toBe(intl.format(value, unit));
    }
  });
});
