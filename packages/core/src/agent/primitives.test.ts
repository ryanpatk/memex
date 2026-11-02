import { describe, expect, it } from 'vitest';
import { summarizeArgs } from './audit';
import { addDays, bucketStart, dayOf, dayStartMs, daySpan, isDay, isTimeZone } from './dates';
import { canonicalTimestamp, compareKeys, decodeCursor, encodeCursor, isAfterCursor, keysetBound } from './keyset';
import { clip, searchTerms } from './text';
import { agentBearerToken, checkAgentToken, normalizeClientName, scopeAllows, type AgentTokenRow } from './tokens';
import type { PageKey } from './types';

const ID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER = '11111111-1111-4111-8111-111111111111';

describe('agent tokens', () => {
  const row = (patch: Partial<AgentTokenRow> = {}): AgentTokenRow => ({
    id: ID_A,
    user_id: USER,
    client_name: 'grok',
    scope: 'read',
    expires_at: null,
    revoked_at: null,
    ...patch,
  });
  const now = new Date('2026-11-01T12:00:00Z');

  it('accepts a live token and reports its scope', () => {
    expect(checkAgentToken(row(), now)).toEqual({ ok: true, scope: 'read' });
    expect(checkAgentToken(row({ scope: 'read_write', expires_at: '2026-12-01T00:00:00Z' }), now)).toEqual({ ok: true, scope: 'read_write' });
  });

  it('refuses revoked, expired and malformed rows', () => {
    expect(checkAgentToken(row({ revoked_at: '2026-10-01T00:00:00Z' }), now)).toEqual({ ok: false, reason: 'revoked' });
    // Revocation wins even over a future expiry.
    expect(checkAgentToken(row({ revoked_at: '2026-10-01T00:00:00Z', expires_at: '2027-01-01T00:00:00Z' }), now).ok).toBe(false);
    expect(checkAgentToken(row({ expires_at: '2026-11-01T12:00:00Z' }), now)).toEqual({ ok: false, reason: 'expired' });
    expect(checkAgentToken(row({ scope: 'admin' }), now)).toEqual({ ok: false, reason: 'invalid' });
    expect(checkAgentToken(row({ user_id: 'nope' }), now)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('enforces scope per access level', () => {
    expect(scopeAllows('read', 'read')).toBe(true);
    expect(scopeAllows('read', 'write')).toBe(false);
    expect(scopeAllows('read_write', 'write')).toBe(true);
  });

  it('only takes mxa_ bearer tokens of the right length', () => {
    const token = `mxa_${'A'.repeat(43)}`;
    expect(agentBearerToken(`Bearer ${token}`)).toBe(token);
    expect(agentBearerToken(`bearer ${token}`)).toBe(token);
    expect(agentBearerToken(token)).toBe(token); // bare token, no scheme
    expect(agentBearerToken(`Basic ${token}`)).toBeNull();
    expect(agentBearerToken(`Bearer mx_${'A'.repeat(43)}`)).toBeNull(); // extension token
    expect(agentBearerToken(`Bearer mxa_${'A'.repeat(42)}`)).toBeNull();
    expect(agentBearerToken(`Bearer mxa_${'A'.repeat(42)}*`)).toBeNull();
    expect(agentBearerToken(null)).toBeNull();
  });

  it('normalizes client names', () => {
    expect(normalizeClientName('  Grok   Bot\n')).toBe('Grok Bot');
    expect(normalizeClientName('')).toBeNull();
    expect(normalizeClientName('x'.repeat(81))).toBeNull();
  });
});

describe('keyset cursors', () => {
  it('canonicalizes Postgres and ISO timestamps to one sortable form', () => {
    expect(canonicalTimestamp('2026-11-01T09:30:00.1+00:00')).toBe('2026-11-01T09:30:00.100000Z');
    expect(canonicalTimestamp('2026-11-01 09:30:00+00')).toBe('2026-11-01T09:30:00.000000Z');
    expect(canonicalTimestamp('2026-11-01T09:30:00.123456789Z')).toBe('2026-11-01T09:30:00.123456Z');
    expect(canonicalTimestamp('2026-11-01T10:30:00+01:00')).toBe('2026-11-01T09:30:00.000000Z');
  });

  it('round-trips cursors and rejects foreign ones', () => {
    const key: PageKey = { at: '2026-11-01T09:30:00.000000Z', type: 'note', id: ID_A };
    expect(decodeCursor(encodeCursor(key))).toEqual(key);
    expect(decodeCursor('2026-11-01T09:30:00.000000Z~user~' + ID_A)).toBeNull();
    expect(decodeCursor('abc')).toBeNull();
    expect(decodeCursor('2026-11-01T09:30:00.000000Z~note~not-a-uuid-not-a-uuid-not-a-uuid-1234')).toBeNull();
  });

  it('orders by time, then type, then id', () => {
    const at = '2026-11-01T09:30:00.000000Z';
    expect(compareKeys({ at, type: 'link', id: ID_B }, { at, type: 'note', id: ID_A })).toBeLessThan(0);
    expect(compareKeys({ at, type: 'note', id: ID_A }, { at, type: 'note', id: ID_B })).toBeLessThan(0);
    expect(isAfterCursor({ at, type: 'link', id: ID_A }, { at, type: 'note', id: ID_A }, 'desc')).toBe(true);
  });

  it('builds per-table bounds that match the merged order', () => {
    const cursor: PageKey = { at: '2026-11-01T09:30:00.000000Z', type: 'note', id: ID_A };
    expect(keysetBound('note', cursor, 'desc')).toMatchObject({ op: 'lt', tieId: ID_A, tieOp: 'lt' });
    expect(keysetBound('link', cursor, 'desc')).toMatchObject({ op: 'lte', tieId: null }); // links sort before notes
    expect(keysetBound('task', cursor, 'desc')).toMatchObject({ op: 'lt', tieId: null });
    expect(keysetBound('task', cursor, 'asc')).toMatchObject({ op: 'gte', tieId: null });
    expect(keysetBound('link', cursor, 'asc')).toMatchObject({ op: 'gt', tieId: null });
  });
});

describe('zone-aware days', () => {
  it('validates days and zones', () => {
    expect(isDay('2026-02-28')).toBe(true);
    expect(isDay('2026-02-30')).toBe(false);
    expect(isDay('2026-2-3')).toBe(false);
    expect(isTimeZone('America/New_York')).toBe(true);
    expect(isTimeZone('Mars/Olympus')).toBe(false);
  });

  it('finds local midnight, across DST changes too', () => {
    expect(new Date(dayStartMs('2026-11-01', 'UTC')).toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(new Date(dayStartMs('2026-07-01', 'America/New_York')).toISOString()).toBe('2026-07-01T04:00:00.000Z');
    // US DST ends 2026-11-01 at 02:00; midnight is still EDT (UTC-4), the next one EST.
    expect(new Date(dayStartMs('2026-11-01', 'America/New_York')).toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(new Date(dayStartMs('2026-11-02', 'America/New_York')).toISOString()).toBe('2026-11-02T05:00:00.000Z');
    expect(dayOf('2026-11-02T03:00:00Z', 'America/New_York')).toBe('2026-11-01');
    expect(dayOf('2026-11-02T03:00:00Z', 'UTC')).toBe('2026-11-02');
  });

  it('does calendar arithmetic and buckets', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daySpan('2026-11-01', '2026-11-30')).toBe(30);
    expect(bucketStart('2026-11-01', 'week')).toBe('2026-10-26'); // a Sunday → its Monday
    expect(bucketStart('2026-11-02', 'week')).toBe('2026-11-02');
    expect(bucketStart('2026-11-17', 'month')).toBe('2026-11-01');
  });
});

describe('search terms and caps', () => {
  it('splits, lowercases, dedupes and strips wildcards', () => {
    expect(searchTerms('  Kyoto  trip kyoto ')).toEqual(['kyoto', 'trip']);
    expect(searchTerms('100% *all* \\x')).toEqual(['100', 'all', 'x']);
    expect(searchTerms('a b c d e f g h')).toHaveLength(6);
    expect(searchTerms('***')).toEqual([]);
  });

  it('clips on a word boundary', () => {
    expect(clip('short', 10)).toBe('short');
    expect(clip('the quick brown fox jumps', 18)).toBe('the quick brown…');
  });
});

describe('audit argument summaries', () => {
  it('keeps ids and enums, reduces text to its length', () => {
    expect(
      summarizeArgs({
        query: 'my secret plan',
        type: 'note',
        id: ID_A,
        types: ['link', 'note'],
        limit: 5,
        cursor: 'whatever',
        nested: { a: 1, b: 2 },
        long_list: [1, 2, 3],
      }),
    ).toEqual({
      query: { chars: 14 },
      type: 'note',
      id: ID_A,
      types: ['link', 'note'],
      limit: 5,
      cursor: 'present',
      nested: { items: 2 },
      long_list: { items: 3 },
    });
    expect(summarizeArgs('nope')).toEqual({});
    expect(summarizeArgs({ type: 'x'.repeat(100) })).toEqual({ type: { chars: 100 } });
  });
});
