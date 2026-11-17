/** “used 2 hours ago”, or “never used”, for a token row. */
export const usedLabel = (iso: string | null, relative: (iso: string) => string) => (iso ? `used ${relative(iso)}` : 'never used');
