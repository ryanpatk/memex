import { Navigate } from 'react-router-dom';
import { INBOX_PARAM, JOURNAL_PATH } from '../constants/modules';
import { useCardsLook } from '../look/look';
import InboxPage from '../pages/InboxPage';

/** `/inbox`: its own page in the Memory Cards look; the classic look keeps the Inbox as the Journal's tray. */
const InboxRoute = () => {
  const cards = useCardsLook();
  if (!cards) return <Navigate to={`${JOURNAL_PATH}?${INBOX_PARAM}=1`} replace />;
  return <InboxPage />;
};

export default InboxRoute;
