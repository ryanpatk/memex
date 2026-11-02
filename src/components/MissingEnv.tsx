/**
 * Shown instead of the app when the real (non-fixture) build has no Supabase
 * settings: says what's missing and how to fix it, with no blocking alert.
 * Never shows values, only variable names.
 */
const MissingEnv = ({ missing }: { missing: string[] }) => (
  <main className="memex-missing-env" role="alert">
    <h1>memex can’t reach its data</h1>
    <p>
      Missing <code translate="no">{missing.join(' / ')}</code>.
    </p>
    <p>
      Copy <code translate="no">.env</code> from the main checkout into this folder (or set the variables), then restart{' '}
      <code translate="no">npm run dev</code>. To look around without an account, run{' '}
      <code translate="no">VITE_MEMEX_FIXTURES=1 npm run dev</code>.
    </p>
  </main>
);

export default MissingEnv;
