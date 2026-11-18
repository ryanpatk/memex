import { useCallback, useMemo } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  UNFILED,
  movePin,
  nextPinPosition,
  parseList,
  pinPositionUpdates,
  pinsFor,
  type LinkWithTag,
  type PinPosition,
  type Profile,
  type ProfileLinkMembership,
} from '@memex/core';
import { repository } from '../data/repository';
import { LIBRARY_PATH, SPACE_PARAM, SPACES_PATH } from '../constants/modules';
import { linkKeys, useAllLinks } from './useLinks';
import { profileLinkKeys, useProfileLinkMembership } from './useProfileLinks';
import { useProfiles } from './useProfiles';

/*
 * Pinned sites on the web (docs/pinned-sites.md): the top bar's pins and the
 * Pinned launcher show the space you're in (a space page, or Cards with one
 * space chosen) and the global pins everywhere else. Order, positions and
 * moves come from @memex/core (pins.ts); this hook writes through the
 * Repository and patches the React Query caches first, so the bar moves at
 * once. A failed write refetches and rethrows for the caller to report.
 */

/** The space whose pins the bar shows, or null for the global pins. */
export const pinScopeOf = (pathname: string, search: string, spaces: readonly Pick<Profile, 'id'>[] | undefined) => {
  const onSpacePage = matchPath(`${SPACES_PATH}/:spaceId`, pathname)?.params.spaceId;
  let id: string | null = onSpacePage ?? null;
  if (!id && pathname === LIBRARY_PATH) {
    const chosen = parseList(new URLSearchParams(search).get(SPACE_PARAM));
    id = chosen.length === 1 && chosen[0] !== UNFILED ? chosen[0] : null;
  }
  // An id that isn't one of your spaces (deleted, mistyped) falls back to the global pins
  return id && spaces?.some((space) => space.id === id) ? id : null;
};

export const usePinScope = () => {
  const { pathname, search } = useLocation();
  const { data: spaces } = useProfiles();
  const spaceId = pinScopeOf(pathname, search, spaces);
  const space = spaceId ? spaces?.find((s) => s.id === spaceId) : undefined;
  return { spaceId, spaceName: space?.name ?? null };
};

type Links = LinkWithTag[] | undefined;
type Rows = ProfileLinkMembership[] | undefined;

export function usePins(spaceId: string | null) {
  const queryClient = useQueryClient();
  const { data: links } = useAllLinks();
  const { data: membership } = useProfileLinkMembership();

  const pins = useMemo(() => pinsFor(links ?? [], membership ?? [], spaceId), [links, membership, spaceId]);

  /** Each pin's current place in this scope. */
  const positions = useMemo(() => {
    const map = new Map<string, PinPosition>();
    if (spaceId) {
      (membership ?? []).forEach((row) => {
        if (row.profile_id === spaceId && row.is_super_favorite) map.set(row.link_id, row.pin_position ?? null);
      });
    } else {
      pins.forEach((link) => map.set(link.id, link.pin_position ?? null));
    }
    return map;
  }, [membership, pins, spaceId]);

  const isPinned = useCallback((linkId: string) => positions.has(linkId), [positions]);

  const patchLinks = useCallback(
    (patch: (link: LinkWithTag) => LinkWithTag) =>
      queryClient.setQueriesData<Links>({ queryKey: linkKeys.lists() }, (old) => (Array.isArray(old) ? old.map(patch) : old)),
    [queryClient],
  );
  const patchRows = useCallback(
    (patch: (rows: ProfileLinkMembership[]) => ProfileLinkMembership[]) =>
      queryClient.setQueryData<Rows>(profileLinkKeys.membership(), (old) => (old ? patch(old) : old)),
    [queryClient],
  );
  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: spaceId ? profileLinkKeys.all : linkKeys.lists() });
  }, [queryClient, spaceId]);

  /** Sets pins' places (and pinned state) in this scope: cache first, then the database. */
  const write = useCallback(
    async (changes: { id: string; pinned: boolean; position: number | null }[]) => {
      if (!changes.length) return;
      const byId = new Map(changes.map((c) => [c.id, c]));
      if (spaceId) {
        await queryClient.cancelQueries({ queryKey: profileLinkKeys.membership() });
        patchRows((rows) => {
          const next = rows.map((row) => {
            const change = row.profile_id === spaceId ? byId.get(row.link_id) : undefined;
            return change ? { ...row, is_super_favorite: change.pinned, pin_position: change.position } : row;
          });
          // A link pinned here before it's filed here gets its row (filed below)
          changes.forEach((change) => {
            if (change.pinned && !rows.some((row) => row.profile_id === spaceId && row.link_id === change.id)) {
              next.push({ profile_id: spaceId, link_id: change.id, is_super_favorite: true, pin_position: change.position });
            }
          });
          return next;
        });
      } else {
        await queryClient.cancelQueries({ queryKey: linkKeys.lists() });
        patchLinks((link) => {
          const change = byId.get(link.id);
          return change ? { ...link, is_super_favorite: change.pinned, pin_position: change.position } : link;
        });
      }
      try {
        if (spaceId) {
          const filed = new Set((membership ?? []).filter((row) => row.profile_id === spaceId).map((row) => row.link_id));
          const toFile = changes.filter((c) => c.pinned && !filed.has(c.id)).map((c) => c.id);
          if (toFile.length) {
            await repository.spaceLinks.addLinks(spaceId, toFile);
            void queryClient.invalidateQueries({ queryKey: profileLinkKeys.all });
          }
          await Promise.all(changes.map((c) => repository.spaceLinks.setSuperFavorite(spaceId, c.id, c.pinned, c.position)));
        } else {
          await Promise.all(
            changes.map((c) => repository.links.update(c.id, { is_super_favorite: c.pinned, pin_position: c.position })),
          );
        }
      } catch (error) {
        refetch();
        throw error;
      }
    },
    [membership, patchLinks, patchRows, queryClient, refetch, spaceId],
  );

  /** Pins links at the end of this scope's pins (already pinned ones are skipped). */
  const pin = useCallback(
    async (linkIds: string[]) => {
      let next = nextPinPosition([...positions.values()]);
      const fresh = Array.from(new Set(linkIds)).filter((id) => !positions.has(id) && !id.startsWith('temp-'));
      await write(fresh.map((id) => ({ id, pinned: true, position: next++ })));
      return fresh;
    },
    [positions, write],
  );

  /** Unpins one link; resolves to a function that puts it back where it was (Undo). */
  const unpin = useCallback(
    async (linkId: string) => {
      const was = positions.get(linkId) ?? null;
      await write([{ id: linkId, pinned: false, position: null }]);
      return () => write([{ id: linkId, pinned: true, position: was }]);
    },
    [positions, write],
  );

  /** Moves the pin at `from` to `to` (indexes in `pins`); writes only the pins whose place changes. */
  const move = useCallback(
    async (from: number, to: number) => {
      if (from === to) return;
      const order = movePin(
        pins.map((link) => link.id),
        from,
        to,
      );
      await write(pinPositionUpdates(order, positions).map(({ id, position }) => ({ id, pinned: true, position })));
    },
    [pins, positions, write],
  );

  return { pins, isPinned, pin, unpin, move };
}

export type Pins = ReturnType<typeof usePins>;
