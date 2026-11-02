// Builds a release iOS bundle with the demo-data switch ON and fails if any
// fixture code made it in. Release builds have __DEV__ = false, so the
// fixture repository (src/data/fixtures) must be stripped no matter what
// EXPO_PUBLIC_MEMEX_FIXTURES says. Also proves Metro can bundle the app
// (including @memex/core from ../../packages/core). Used by CI.
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = mkdtempSync(join(tmpdir(), 'memex-mobile-release-'));
try {
  execFileSync('npx', ['expo', 'export', '--platform', 'ios', '--output-dir', out], {
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, EXPO_PUBLIC_MEMEX_FIXTURES: '1', CI: '1' },
  });
  const dir = join(out, '_expo/static/js/ios');
  const bundle = Buffer.concat(readdirSync(dir).map((f) => readFileSync(join(dir, f))));
  const has = (text) => bundle.includes(Buffer.from(text));

  if (!has('Continue with GitHub')) throw new Error('bundle check is broken: the sign-in screen text is missing');
  const leaked = ['demo@memex.app', 'picsum.photos', 'Sign-up is off in demo mode', 'OAuth is not available with demo data'].filter(has);
  if (leaked.length) throw new Error(`fixture code shipped in the release bundle: ${leaked.join(', ')}`);
  console.log(`release bundle OK (${(bundle.length / 1e6).toFixed(1)} MB, no fixture code)`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
