import type { Repository } from '@memex/core';

/*
 * A Repository with a network switch, for tests of offline saves: while
 * "offline", every data call fails the way React Native's fetch does
 * (TypeError: Network request failed); `loseNextResponse` lets the next write
 * reach the store but fails its answer, like a connection dropping mid-save.
 * Auth stays local so the session holds.
 */

type Area = Record<string, unknown>;

export const withNetwork = (base: Repository) => {
  let online = true;
  let loseNext = false;
  const calls: string[] = [];
  const offline = () => new TypeError('Network request failed');

  const wrapArea = (name: string, area: Area): Area =>
    Object.fromEntries(
      Object.entries(area).map(([key, value]) => {
        if (typeof value !== 'function') return [key, value];
        const fn = value as (...args: unknown[]) => Promise<unknown>;
        return [
          key,
          async (...args: unknown[]) => {
            calls.push(`${name}.${key}`);
            if (!online) throw offline();
            const result = await fn(...args);
            if (loseNext && /^(create|add)/.test(key)) {
              loseNext = false;
              throw offline();
            }
            return result;
          },
        ];
      }),
    );

  const repository = Object.fromEntries(
    Object.entries(base).map(([name, area]) => [name, name === 'auth' ? area : wrapArea(name, area as Area)]),
  ) as unknown as Repository;

  return {
    repository,
    calls,
    setOnline(next: boolean) {
      online = next;
    },
    loseNextResponse() {
      loseNext = true;
    },
  };
};

/** Deterministic UUID-shaped ids for tests. */
export const sequentialIds = (prefix = '0b4c2a8e-0000-4000-8000-') => {
  let n = 0;
  return () => `${prefix}${String((n += 1)).padStart(12, '0')}`;
};
