import { describe, expect, it } from 'vitest';
import { pinScopeOf } from './usePins';
import { dropTarget } from '../components/cards/pinDrag';

const spaces = [{ id: 'kitchen' }, { id: 'kyoto' }];

describe('pinScopeOf', () => {
  it('is the space on its page', () => {
    expect(pinScopeOf('/spaces/kitchen', '', spaces)).toBe('kitchen');
    expect(pinScopeOf('/spaces/kitchen', '?show=journal', spaces)).toBe('kitchen');
  });

  it('is the space on Cards when exactly one space is chosen', () => {
    expect(pinScopeOf('/library', '?space=kyoto', spaces)).toBe('kyoto');
    expect(pinScopeOf('/library', '?space=kyoto&view=list', spaces)).toBe('kyoto');
  });

  it('is global everywhere else', () => {
    expect(pinScopeOf('/', '', spaces)).toBeNull();
    expect(pinScopeOf('/tasks', '?space=kyoto', spaces)).toBeNull();
    expect(pinScopeOf('/library', '', spaces)).toBeNull();
    expect(pinScopeOf('/library', '?space=unfiled', spaces)).toBeNull();
    expect(pinScopeOf('/library', '?space=kyoto,kitchen', spaces)).toBeNull();
  });

  it('falls back to global for a space that isn’t yours (or before spaces load)', () => {
    expect(pinScopeOf('/spaces/gone', '', spaces)).toBeNull();
    expect(pinScopeOf('/spaces/kitchen', '', undefined)).toBeNull();
  });
});

describe('dropTarget', () => {
  it('turns before/after a pin into movePin’s index', () => {
    // Pin 0 dropped after pin 3 lands at index 3 (the others shift left)
    expect(dropTarget(0, { index: 3, side: 'after' })).toBe(3);
    expect(dropTarget(0, { index: 3, side: 'before' })).toBe(2);
    // Moving left: before pin 1 is index 1
    expect(dropTarget(4, { index: 1, side: 'before' })).toBe(1);
    expect(dropTarget(4, { index: 1, side: 'after' })).toBe(2);
    // On itself: no move
    expect(dropTarget(2, { index: 2, side: 'before' })).toBe(2);
    expect(dropTarget(2, { index: 2, side: 'after' })).toBe(2);
  });
});
