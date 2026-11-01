/**
 * Fixed allowlist of acceptable top-level domains.
 *
 * Used to decide whether typed input looks enough like a real URL to offer
 * "Add bookmark". This deliberately covers common gTLDs, popular new TLDs, and
 * ccTLDs rather than the full IANA list — the goal is to reject arbitrary
 * "word.word" text, not to be exhaustive. Multi-part suffixes (e.g. co.uk) are
 * handled implicitly: only the final label is checked, so `example.co.uk`
 * passes on `uk`.
 */
export const ACCEPTED_TLDS: ReadonlySet<string> = new Set([
  // Legacy / core gTLDs
  'com', 'org', 'net', 'edu', 'gov', 'mil', 'int',
  // Common tech / product TLDs
  'io', 'co', 'ai', 'app', 'dev', 'xyz', 'info', 'biz', 'me', 'tv', 'cc',
  'gg', 'sh', 'fm', 'to', 'ly', 'so', 'st', 'im', 'is', 'la',
  // Popular new gTLDs
  'site', 'online', 'store', 'shop', 'tech', 'blog', 'cloud', 'design',
  'page', 'wiki', 'news', 'live', 'life', 'world', 'space', 'fun', 'club',
  'work', 'agency', 'studio', 'digital', 'media', 'email', 'software',
  'systems', 'network', 'group', 'solutions', 'finance', 'money', 'market',
  'games', 'tools', 'zone', 'run', 'link', 'chat', 'social', 'community',
  // Sponsored / restricted
  'aero', 'asia', 'cat', 'coop', 'jobs', 'museum', 'travel', 'mobi', 'name',
  'pro', 'tel',
  // Country codes
  'us', 'uk', 'ca', 'de', 'fr', 'jp', 'cn', 'ru', 'au', 'nl', 'se', 'no',
  'es', 'it', 'ch', 'be', 'at', 'dk', 'fi', 'pl', 'br', 'in', 'mx', 'kr',
  'nz', 'ie', 'pt', 'gr', 'cz', 'ro', 'hu', 'sk', 'ua', 'tr', 'za', 'sg',
  'hk', 'tw', 'th', 'id', 'my', 'ph', 'vn', 'il', 'ae', 'sa', 'cl', 'ar',
  'pe', 'eu',
]);
