import { describe, expect, it } from 'vitest';
import { parseComposer } from '@memex/core';
import { buildDemoData } from '../data/fixtures/demoData';
import { toJournal } from '../data/journal';
import { appendMention, draftSuggestion, fileByDefault, insertMention, pickerFor } from './composerModel';

const NOW = new Date(2026, 10, 1, 12, 0);
const journal = toJournal(buildDemoData(NOW), '#5077ff', NOW);
const spaces = journal.spaces;

describe('the @ picker', () => {
  it('opens on a partial mention before the caret and closes on a finished one', () => {
    const text = '[] Book ryokan @ky';
    expect(pickerFor(text, text.length, spaces)?.matches.map((s) => s.name)).toEqual(['Kyoto trip']);
    expect(pickerFor('@', 1, spaces)?.matches).toHaveLength(4);
    const done = 'Lunch @Kyoto trip';
    expect(pickerFor(done, done.length, spaces)).toBeNull();
    expect(pickerFor('email@host', 10, spaces)).toBeNull();
    expect(pickerFor('@zzz', 4, spaces)).toBeNull();
  });

  it('inserts the picked space and moves the caret past it', () => {
    const text = '[] Book ryokan @ky later';
    const caret = '[] Book ryokan @ky'.length;
    const picker = pickerFor(text, caret, spaces)!;
    const next = insertMention(text, caret, picker.query, picker.matches[0]);
    expect(next.text).toBe('[] Book ryokan @Kyoto trip later');
    expect(next.caret).toBe('[] Book ryokan @Kyoto trip '.length);
    // …and core's parser files it.
    expect(parseComposer(next.text, spaces)).toMatchObject({ kind: 'task', title: 'Book ryokan later', spaces: [{ id: 'kyoto' }] });
  });

  it('appends a mention for an accepted suggestion', () => {
    expect(appendMention('Pack film  ', spaces[0])).toEqual({ text: 'Pack film @Studio ', caret: 18 });
  });
});

describe('draft suggestions', () => {
  it('suggests the space a draft names, for jots too', () => {
    const parsed = parseComposer('Notes on the studio wall', spaces);
    expect(draftSuggestion(parsed, journal.filer, NOW)?.space.name).toBe('Studio');
  });

  it('suggests from similar filed items', () => {
    const parsed = parseComposer('[] Book the ryokan for Arashiyama', spaces);
    expect(draftSuggestion(parsed, journal.filer, NOW)).toMatchObject({ space: { id: 'kyoto' } });
  });

  it('stays quiet once the draft names a space, or when empty', () => {
    expect(draftSuggestion(parseComposer('[] Book the ryokan @Home', spaces), journal.filer, NOW)).toBeUndefined();
    expect(draftSuggestion(parseComposer('   ', spaces), journal.filer, NOW)).toBeUndefined();
  });
});

describe('on a space’s screen', () => {
  const kyoto = spaces.find((s) => s.name === 'Kyoto trip')!;

  it('files what you send in that space unless it names its own', () => {
    expect(fileByDefault(parseComposer('[test] tea at Ippodo', spaces), kyoto)).toMatchObject({ kind: 'jot', spaces: [{ id: 'kyoto' }] });
    expect(fileByDefault(parseComposer('[] [test] film', spaces), kyoto)).toMatchObject({ kind: 'task', spaces: [{ id: 'kyoto' }] });
    expect(fileByDefault(parseComposer('[test] idea @Studio', spaces), kyoto).spaces.map((s) => s.id)).toEqual(['studio']);
    expect(fileByDefault(parseComposer('   ', spaces), kyoto)).toMatchObject({ kind: 'empty', spaces: [] });
    expect(fileByDefault(parseComposer('[test] anywhere', spaces), undefined).spaces).toEqual([]);
  });

  it('stops suggesting another space, since it’s already filed', () => {
    const parsed = fileByDefault(parseComposer('Moss garden at Saihō-ji', spaces), kyoto);
    expect(draftSuggestion(parsed, journal.filer, NOW)).toBeUndefined();
  });
});
