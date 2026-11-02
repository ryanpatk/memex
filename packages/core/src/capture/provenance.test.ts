import { describe, expect, it } from 'vitest';
import { WEB_CLIENT, withAppProvenance } from './provenance';
import { normalizeUrlKey } from './urlKey';

describe('withAppProvenance', () => {
  it('marks a link saved in the app with captured_by app, the client and its URL key', () => {
    const url = 'https://www.are.na/ryan/working-memory?utm_source=x';
    expect(withAppProvenance({ url, title: 'Working memory' }, WEB_CLIENT)).toEqual({
      url,
      title: 'Working memory',
      captured_by: 'app',
      captured_client: 'memex-web',
      url_key: normalizeUrlKey(url),
    });
  });

  it('keeps provenance the caller already set', () => {
    const stamped = withAppProvenance(
      { url: 'https://example.com', captured_by: 'share', captured_client: 'memex-ios/0.1.0', url_key: 'k' },
      WEB_CLIENT,
    );
    expect(stamped).toMatchObject({ captured_by: 'share', captured_client: 'memex-ios/0.1.0', url_key: 'k' });
  });
});
