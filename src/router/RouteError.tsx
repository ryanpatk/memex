import { useEffect } from 'react';
import { useRouteError } from 'react-router-dom';
import { EmptyState } from '../components/ui';

/**
 * The route error boundary (router/index.tsx `errorElement`): a calm panel
 * with Reload and a way home instead of a blank page. `page` stands alone
 * (the root route, outside the providers, so it uses nothing from them);
 * `panel` fills the shell's main column and keeps the sidebar. Home is a
 * plain link, a full load, so nothing from the broken render carries over.
 */
const RouteError = ({ variant = 'page' }: { variant?: 'page' | 'panel' }) => {
  const error = useRouteError();

  useEffect(() => {
    console.error('A page failed to render:', error);
  }, [error]);

  const body = (
    <EmptyState
      title="Something went wrong"
      subtitle="memex hit a problem showing this page. Reloading usually sorts it out."
      role="alert"
    >
      <div className="memex-route-error-actions">
        <button type="button" className="btn-primary btn-compact" onClick={() => window.location.reload()}>
          Reload
        </button>
        <a className="btn-secondary btn-compact" href="/">
          Go to the Journal
        </a>
      </div>
    </EmptyState>
  );

  return variant === 'panel' ? (
    <div className="memex-route-error is-panel">{body}</div>
  ) : (
    <div className="app-surface page-shell memex-route-error">{body}</div>
  );
};

export default RouteError;
