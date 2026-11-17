import { Link } from 'react-router-dom';
import AppLogo from '../components/AppLogo';
import DarkModeToggle from '../components/DarkModeToggle';
import { useCardsLook } from '../look/look';
import { EmptySlot } from '../components/cards/Controls';
import { LIBRARY_PATH } from '../constants/modules';

const NotFoundPage = () => {
  const cards = useCardsLook();
  if (cards) {
    // d41: an empty grey slot with a “?” and one way back
    return (
      <main className="mc-standalone">
        <EmptySlot
          headingLevel="h1"
          glyph={<span aria-hidden="true">?</span>}
          title="This card isn’t here"
          body="It may have been deleted, or the link is wrong."
          action={
            <Link to={LIBRARY_PATH} className="mc-btn is-primary">
              Back to your cards
            </Link>
          }
        />
      </main>
    );
  }
  return (
    <div className="app-surface page-shell">
      <div className="page-center">
        <div className="page-card">
          <header className="page-card-header">
            <div className="page-card-header-row">
              <AppLogo />
              <DarkModeToggle />
            </div>
            <h1 className="page-card-title">Page not found</h1>
            <p className="page-muted">We couldn&apos;t find that route.</p>
          </header>
          <Link to="/" className="btn-primary w-full">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFoundPage;
