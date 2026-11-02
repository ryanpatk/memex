import { describe, expect, it, vi } from 'vitest';
import { createDemoData } from '../memory/demoData';
import { createMemoryRepository } from '../memory/repository';
import type { Repository } from '../repository';
import { parseCaptureInput, type CaptureInput } from './input';
import { createRepositoryCaptureStore, mightMatch, toCapturedLink } from './repositoryStore';
import { CaptureConflictError, createCaptureService, linkMatchFor } from './service';

const fromApp = (url: string): CaptureInput => {
  const r = parseCaptureInput({ url }, { defaultCapturedBy: 'app', defaultClient: 'memex-ios/0.1.0' });
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

const setup = () => {
  const repository = createMemoryRepository(createDemoData(Date.parse('2026-11-01T12:00:00Z')));
  return { repository, capture: createCaptureService(createRepositoryCaptureStore(repository)) };
};

describe('repository capture store', () => {
  it('saves a new link with the app as its provenance', async () => {
    const { repository, capture } = setup();
    const result = await capture.capture(fromApp('https://example.org/essay?utm_source=feed'));
    expect(result.duplicate).toBe(false);
    const row = await repository.links.getById(result.link.id);
    expect(row).toMatchObject({
      url: 'https://example.org/essay?utm_source=feed',
      source: 'web',
      captured_by: 'app',
      captured_client: 'memex-ios/0.1.0',
      url_key: 'example.org/essay',
    });
  });

  it('identifies platform saves and finds them again under another URL', async () => {
    const { repository, capture } = setup();
    const first = await capture.capture(fromApp('https://youtu.be/dQw4w9WgXcQ'));
    expect(first.link).toMatchObject({ source: 'youtube', source_id: 'dQw4w9WgXcQ' });
    const before = (await repository.links.getAll()).length;
    const again = await capture.capture(fromApp('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30'));
    expect(again.duplicate).toBe(true);
    expect(again.link.id).toBe(first.link.id);
    expect(await repository.links.getAll()).toHaveLength(before);
  });

  it('matches rows saved before url keys existed', async () => {
    const { repository, capture } = setup();
    const old = await repository.links.create({ url: 'https://www.example.com/a/' });
    const result = await capture.capture(fromApp('https://example.com/a'));
    expect(result).toMatchObject({ duplicate: true, link: { id: old.id } });
  });

  it('reads candidates from a cache when given one, skipping temp rows', async () => {
    const { repository } = setup();
    const getAll = vi.spyOn(repository.links, 'getAll');
    const cached = [{ id: 'temp-1', url: 'https://a.test/', created_at: '', updated_at: '', order_index: 0, user_id: '', project_id: '' }];
    const store = createRepositoryCaptureStore(repository, { links: () => cached });
    expect(await store.findCandidates(linkMatchFor('https://a.test/'))).toEqual([]);
    expect(getAll).not.toHaveBeenCalled();
  });

  it('turns a unique violation into CaptureConflictError', async () => {
    const { repository } = setup();
    const failing: Repository = {
      ...repository,
      links: { ...repository.links, create: () => Promise.reject({ code: '23505', message: 'duplicate key value' }) },
    };
    const store = createRepositoryCaptureStore(failing);
    await expect(
      store.insertLink({ ...toCapturedLink({ id: 'x', url: 'https://a.test/', created_at: '', updated_at: '', order_index: 0, user_id: '', project_id: '' }) }),
    ).rejects.toBeInstanceOf(CaptureConflictError);
  });

  it('merges tags and files into spaces idempotently', async () => {
    const { repository } = setup();
    const store = createRepositoryCaptureStore(repository);
    await store.addTags('ln-1', ['tg-howto']);
    expect((await repository.links.getById('ln-1'))?.link_tags?.map((t) => t.tag_id).sort()).toEqual(['tg-howto', 'tg-inspo']);
    await store.addToSpace('ln-1', 'sp-kyoto');
    await store.addToSpace('ln-1', 'sp-kyoto');
    expect((await repository.spaceLinks.listMembership()).filter((r) => r.link_id === 'ln-1' && r.profile_id === 'sp-kyoto')).toHaveLength(1);
    expect(await store.ownedSpaceIds(['sp-kyoto', 'nope'])).toEqual(['sp-kyoto']);
    expect(await store.deleteLink('ln-1')).toBe(true);
    expect(await store.deleteLink('ln-1')).toBe(false);
  });

  it('mightMatch over-matches by key, url or id fragment', () => {
    const m = linkMatchFor('https://x.com/someone/status/1234567890123');
    expect(mightMatch({ url: 'https://twitter.com/i/web/status/1234567890123', source: null, source_id: null, url_key: null }, m)).toBe(true);
    expect(mightMatch({ url: 'https://example.com/', source: null, source_id: null, url_key: null }, m)).toBe(false);
  });
});
