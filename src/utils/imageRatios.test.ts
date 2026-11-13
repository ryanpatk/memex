import { describe, expect, it, vi } from 'vitest';
import { getImageRatio, getShownRatio, guessImageRatio, layoutRatio, setImageRatio, setShownRatio, subscribeImageRatios } from './imageRatios';

describe('image ratios', () => {
  it('guesses by where the link came from', () => {
    expect(guessImageRatio('https://www.youtube.com/watch?v=x')).toBe(0.5625);
    expect(guessImageRatio('https://www.pinterest.com/pin/1', 'pinterest')).toBe(1.4);
    expect(guessImageRatio('https://x.com/a/status/1', 'x')).toBe(0.5625);
    expect(guessImageRatio('https://example.com/post')).toBe(0.525); // a 1200×630 og:image
  });

  it('remembers a picture’s size and tells listeners only about real changes', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeImageRatios(listener);
    setImageRatio('https://img.example/a.jpg', 800, 1200);
    expect(getImageRatio('https://img.example/a.jpg')).toBe(1.5);
    setImageRatio('https://img.example/a.jpg', 400, 600); // same ratio
    setImageRatio('https://img.example/b.jpg', 0, 600); // no size yet
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getImageRatio('https://img.example/b.jpg')).toBeUndefined();
    unsubscribe();
  });

  it('lays a card out at what it shows, then what is known, then a guess', () => {
    const url = 'https://img.example/c.jpg';
    expect(layoutRatio(url, 'https://www.youtube.com/watch?v=c')).toBe(0.5625);
    setImageRatio(url, 100, 100);
    expect(layoutRatio(url, 'https://www.youtube.com/watch?v=c')).toBe(1);
    setShownRatio(url, 0.75);
    expect(getShownRatio(url)).toBe(0.75);
    expect(layoutRatio(url, 'https://www.youtube.com/watch?v=c')).toBe(0.75);
  });
});
