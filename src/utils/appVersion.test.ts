import { describe, expect, it } from 'vitest';
import { isNewerDeploy, mainBundleOf } from './appVersion';

const page = (src: string) =>
  `<!doctype html><html><head><script>window.x=1</script><script type="module" crossorigin src="${src}"></script></head></html>`;

describe('mainBundleOf', () => {
  it('finds the module script, not inline ones', () => {
    expect(mainBundleOf(page('/assets/index-C65wuXtm.js'))).toBe('/assets/index-C65wuXtm.js');
    expect(mainBundleOf('<script src="/other.js"></script>')).toBeNull();
    expect(mainBundleOf('')).toBeNull();
  });
});

describe('isNewerDeploy', () => {
  it('is true only when the deployed bundle differs from the running one', () => {
    expect(isNewerDeploy(page('/assets/index-NEW.js'), '/assets/index-OLD.js')).toBe(true);
    expect(isNewerDeploy(page('/assets/index-OLD.js'), '/assets/index-OLD.js')).toBe(false);
  });

  it('stays quiet when either side is unknown (dev server, an error page)', () => {
    expect(isNewerDeploy('<html>Bad gateway</html>', '/assets/index-OLD.js')).toBe(false);
    expect(isNewerDeploy(page('/assets/index-NEW.js'), null)).toBe(false);
  });
});
