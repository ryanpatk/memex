import { useEffect } from 'react';
import { useRouteError } from 'react-router-dom';
import { EmptySlot } from '../components/cards/Controls';

/**
 * The route error boundary (router/index.tsx `errorElement`): a calm panel
 * with Reload and a way home instead of a blank page. `page` stands alone
 * (the root route, outside the providers, so it uses nothing from them);
 * `panel` fills the shell's main column and keeps the top bar. Home is a
 * plain link, a full load, so nothing from the broken render carries over.
 */
const RouteError = ({ variant = 'page' }: { variant?: 'page' | 'panel' }) => {
  const error = useRouteError();

  useEffect(() => {
    console.error('A page failed to render:', error);
  }, [error]);

  // d40: a red empty slot with a “!”, Reload first
  const slot = (
    <EmptySlot
      headingLevel={variant === 'page' ? 'h1' : 'h2'}
      color="var(--mc-err)"
      glyph={<span aria-hidden="true">!</span>}
      title="Something went wrong"
      body="memex hit a problem showing this page. Reloading usually sorts it out."
      action={
        <div className="mc-error-actions" role="group" aria-label="Recover">
          <button type="button" className="mc-btn is-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
          <a className="mc-btn" href="/">
            Go to the Journal
          </a>
        </div>
      }
    />
  );
  return variant === 'panel' ? <div className="mc-page mc-route-error" role="alert">{slot}</div> : <main className="mc-standalone" role="alert">{slot}</main>;
};

export default RouteError;
