import { describe, expect, it } from 'vitest';
import { getLinkTitle, getUrlLabel, getUrlTitle } from './links';
import { markdownExcerpt, noteDisplayTitle, stripMarkdown } from './markdown';
import { dueDateIso, fromDayKey, groupByTime, shiftDay, timeGroupFor, toDayKey } from './time';

describe('markdown', () => {
  it('strips syntax for excerpts', () => {
    expect(stripMarkdown('# Title\n- [x] **done** and [a link](https://x.y) ![img](i.png) `code`')).toBe(
      'Title done and a link code',
    );
  });

  it('cuts long excerpts with an ellipsis', () => {
    expect(markdownExcerpt('word '.repeat(50), 10)).toBe('word word…');
    expect(markdownExcerpt('short')).toBe('short');
  });

  it('titles a note by its title, else its first non-empty line', () => {
    expect(noteDisplayTitle({ title: ' Plan ', body: 'x' })).toBe('Plan');
    expect(noteDisplayTitle({ title: '', body: '\n\n## First *line*\nsecond' })).toBe('First line');
    expect(noteDisplayTitle({ body: '' })).toBe('Untitled note');
  });
});

describe('link display', () => {
  it('labels a URL by host and decoded path', () => {
    expect(getUrlLabel('https://www.github.com/a%20b/c/')).toBe('github.com/a b/c');
    expect(getUrlTitle('https://github.com/anthropics/claude-code')).toBe('anthropics/claude-code');
    expect(getUrlTitle('https://www.example.com/')).toBe('example.com');
  });

  it('prefers a scraped title, then a real stored title, then the URL', () => {
    const url = 'https://example.com/post';
    expect(getLinkTitle({ url, title: 'Stored' }, 'Scraped')).toBe('Scraped');
    expect(getLinkTitle({ url, title: 'Stored' })).toBe('Stored');
    expect(getLinkTitle({ url, title: 'example.com' })).toBe('post');
    expect(getLinkTitle({ url, title: 'https://example.com/post/' })).toBe('post');
  });
});

describe('time', () => {
  const now = new Date(2026, 9, 25, 15);

  it('buckets dates by recency', () => {
    expect(timeGroupFor(new Date(2026, 9, 25, 0, 1).toISOString(), now)).toBe('Today');
    expect(timeGroupFor(new Date(2026, 9, 19, 0, 1).toISOString(), now)).toBe('This week');
    expect(timeGroupFor(new Date(2026, 8, 26).toISOString(), now)).toBe('This month');
    expect(timeGroupFor(new Date(2026, 0, 1).toISOString(), now)).toBe('Earlier');
  });

  it('groups in fixed order, keeping item order inside a group', () => {
    const today = new Date().toISOString();
    const old = new Date(2000, 0, 1).toISOString();
    expect(groupByTime([{ d: old, n: 1 }, { d: today, n: 2 }, { d: old, n: 3 }], (x) => x.d)).toEqual([
      { label: 'Today', items: [{ d: today, n: 2 }] },
      { label: 'Earlier', items: [{ d: old, n: 1 }, { d: old, n: 3 }] },
    ]);
  });

  it('reads due dates as local midnight', () => {
    expect(dueDateIso('2026-10-25')).toBe('2026-10-25T00:00:00');
    expect(dueDateIso('2026-10-25T10:00:00Z')).toBe('2026-10-25T10:00:00Z');
  });

  it('moves day keys across month and year ends', () => {
    expect(toDayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(fromDayKey('2026-03-01').getMonth()).toBe(2);
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
  });
});
