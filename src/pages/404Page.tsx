import { Link } from 'react-router-dom';
import { EmptySlot } from '../components/cards/Controls';
import { LIBRARY_PATH } from '../constants/modules';

const NotFoundPage = () => {
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
};

export default NotFoundPage;
