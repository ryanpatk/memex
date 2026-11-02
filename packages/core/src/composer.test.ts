import { describe, expect, it } from 'vitest';
import { extractMentions, mentionQuery, parseComposer, type ComposerSpace } from './composer';

const work: ComposerSpace = { id: 'w', name: 'Work' };
const workStuff: ComposerSpace = { id: 'ws', name: 'Work Stuff' };
const joyful: ComposerSpace = { id: 'j', name: 'Joyful Systems' };
const spaces = [work, workStuff, joyful];

describe('extractMentions', () => {
  it('removes a mention and files the space', () => {
    expect(extractMentions('buy milk @Work', spaces)).toEqual({ text: 'buy milk', spaces: [work] });
  });

  it('matches case-insensitively, anywhere in the text', () => {
    expect(extractMentions('@work call Sam', spaces)).toEqual({ text: 'call Sam', spaces: [work] });
  });

  it('prefers the longest space name', () => {
    expect(extractMentions('notes @Work Stuff today', spaces)).toEqual({ text: 'notes today', spaces: [workStuff] });
  });

  it('matches a name with spaces and punctuation removed', () => {
    expect(extractMentions('ship it @joyfulsystems', spaces)).toEqual({ text: 'ship it', spaces: [joyful] });
  });

  it('needs the name to end at a word boundary', () => {
    expect(extractMentions('go to @Workshop', spaces)).toEqual({ text: 'go to @Workshop', spaces: [] });
  });

  it('ignores @ inside a word (email addresses)', () => {
    expect(extractMentions('mail me@Work.com', spaces)).toEqual({ text: 'mail me@Work.com', spaces: [] });
  });

  it('leaves unknown mentions in the text', () => {
    expect(extractMentions('hi @Nobody', spaces)).toEqual({ text: 'hi @Nobody', spaces: [] });
  });

  it('files a space once even when mentioned twice', () => {
    expect(extractMentions('@Work a @work b', spaces)).toEqual({ text: 'a b', spaces: [work] });
  });

  it('files several spaces in mention order', () => {
    expect(extractMentions('@Joyful Systems and @Work', spaces).spaces).toEqual([joyful, work]);
  });

  it('collapses the double spaces a removed mention leaves and trims', () => {
    expect(extractMentions('  one @Work  two  ', spaces).text).toBe('one two');
  });

  it('keeps newlines', () => {
    expect(extractMentions('line one\nline two @Work', spaces).text).toBe('line one\nline two');
  });

  it('leaves a leading space when a mention starts a later line (current behaviour)', () => {
    // Only runs of spaces/tabs collapse, so the space after the mention stays.
    expect(extractMentions('line one\n@Work line two', spaces).text).toBe('line one\n line two');
  });
});

describe('mentionQuery', () => {
  it('returns the partial mention before the caret', () => {
    expect(mentionQuery('call @Wo')).toBe('Wo');
  });

  it('returns an empty query right after @', () => {
    expect(mentionQuery('@')).toBe('');
  });

  it('allows spaces inside the query (multi-word names)', () => {
    expect(mentionQuery('x @Work St')).toBe('Work St');
  });

  it('is null when @ is inside a word', () => {
    expect(mentionQuery('me@Wo')).toBeNull();
  });

  it('is null once a newline follows', () => {
    expect(mentionQuery('@Work\nnext')).toBeNull();
  });

  it('is null after 40 characters', () => {
    expect(mentionQuery(`@${'a'.repeat(41)}`)).toBeNull();
    expect(mentionQuery(`@${'a'.repeat(40)}`)).toBe('a'.repeat(40));
  });

  it('is null without an @', () => {
    expect(mentionQuery('plain text')).toBeNull();
  });
});

describe('parseComposer', () => {
  it('is empty for blank input', () => {
    expect(parseComposer('   ', spaces)).toEqual({ kind: 'empty', spaces: [] });
  });

  it('is empty, with spaces, when only a mention was typed', () => {
    expect(parseComposer('@Work', spaces)).toEqual({ kind: 'empty', spaces: [work] });
  });

  it('makes a jot from plain text', () => {
    expect(parseComposer('remember the milk', spaces)).toEqual({ kind: 'jot', body: 'remember the milk', spaces: [] });
  });

  it('makes a task from "[] " and "[ ] "', () => {
    expect(parseComposer('[] buy milk', spaces)).toEqual({ kind: 'task', title: 'buy milk', spaces: [] });
    expect(parseComposer('[ ] buy milk', spaces)).toEqual({ kind: 'task', title: 'buy milk', spaces: [] });
  });

  it('needs whitespace after the brackets for a task', () => {
    expect(parseComposer('[]buy milk', spaces).kind).toBe('jot');
    expect(parseComposer('[x] done', spaces).kind).toBe('jot');
  });

  it('files a task and collapses its whitespace', () => {
    expect(parseComposer('[] call\n  the   bank @Work', spaces)).toEqual({
      kind: 'task',
      title: 'call the bank',
      spaces: [work],
    });
  });

  it('reads a task even when the mention comes first', () => {
    expect(parseComposer('@Work [] ship', spaces)).toEqual({ kind: 'task', title: 'ship', spaces: [work] });
  });

  it('caps task titles at 200 characters', () => {
    const result = parseComposer(`[] ${'a'.repeat(250)}`, spaces);
    expect(result.kind === 'task' && result.title.length).toBe(200);
  });

  it('makes a link from a lone URL, adding a scheme to bare domains', () => {
    expect(parseComposer('https://example.com/a?b=1', spaces)).toEqual({
      kind: 'link',
      url: 'https://example.com/a?b=1',
      spaces: [],
    });
    expect(parseComposer('example.com', spaces)).toEqual({ kind: 'link', url: 'http://example.com', spaces: [] });
  });

  it('makes a link from any lone http(s):// URL, even on a TLD outside the allowlist', () => {
    expect(parseComposer('https://www.are.na/ryan/working-memory', spaces)).toEqual({
      kind: 'link',
      url: 'https://www.are.na/ryan/working-memory',
      spaces: [],
    });
    // Without the scheme it stays a jot: bare "word.word" text is too often not a URL
    expect(parseComposer('are.na', spaces).kind).toBe('jot');
  });

  it('files a link', () => {
    expect(parseComposer('github.com/anthropics @Work', spaces)).toEqual({
      kind: 'link',
      url: 'http://github.com/anthropics',
      spaces: [work],
    });
  });

  it('treats a URL inside a sentence as a jot', () => {
    expect(parseComposer('read example.com later', spaces).kind).toBe('jot');
  });

  it('treats word.word with an unknown TLD as a jot', () => {
    expect(parseComposer('file.txt', spaces).kind).toBe('jot');
  });

  describe('as a note (⌘↵)', () => {
    it('uses a short single line as the title with no body', () => {
      expect(parseComposer('Meeting notes', spaces, true)).toEqual({
        kind: 'note',
        title: 'Meeting notes',
        body: '',
        spaces: [],
      });
    });

    it('keeps the whole text as the body when there are more lines', () => {
      expect(parseComposer('Title\nsecond line', spaces, true)).toEqual({
        kind: 'note',
        title: 'Title',
        body: 'Title\nsecond line',
        spaces: [],
      });
    });

    it('truncates a long first line for the title and keeps it in the body', () => {
      const line = 'x'.repeat(90);
      expect(parseComposer(line, spaces, true)).toEqual({
        kind: 'note',
        title: `${'x'.repeat(80)}…`,
        body: line,
        spaces: [],
      });
    });

    it('wins over task and link syntax', () => {
      expect(parseComposer('[] not a task', spaces, true).kind).toBe('note');
      expect(parseComposer('example.com', spaces, true).kind).toBe('note');
    });

    it('files the note', () => {
      expect(parseComposer('Plan @Work', spaces, true)).toMatchObject({ kind: 'note', title: 'Plan', spaces: [work] });
    });
  });
});
