import { hostOf, parseComposer, type ComposerResult, type Profile } from '@memex/core';

export type CaptureKind = 'jot' | 'note' | 'task' | 'link';

/** What a capture's text will become, before the person overrides it. */
export const detectCaptureKind = (text: string, spaces: Profile[]): CaptureKind => {
  const parsed = parseComposer(text, spaces);
  return parsed.kind === 'empty' ? 'jot' : parsed.kind;
};

/** The title a capture's card will show, per kind. */
export const captureTitle = (parsed: ComposerResult, kind: CaptureKind) => {
  if (parsed.kind === 'empty') return '';
  if (kind === 'link' && parsed.kind === 'link') return hostOf(parsed.url);
  const text = parsed.kind === 'jot' ? parsed.body : parsed.kind === 'link' ? parsed.url : parsed.title;
  return text.split('\n')[0];
};
