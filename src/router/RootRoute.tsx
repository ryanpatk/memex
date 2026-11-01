import { Navigate } from "react-router-dom";
import { useSession } from "../context/SessionContext";
import JournalPage from "../pages/JournalPage";
import MemexShell from "../components/MemexShell";
import { SIGN_IN_PATH } from "../utils/authRedirect";

/** `/`: the Journal for a signed-in user (memex's home), sign-in otherwise. */
const RootRoute = () => {
  const { session, authHydrated } = useSession();
  if (!authHydrated) return null;
  if (!session) return <Navigate to={SIGN_IN_PATH} replace />;
  return (
    <MemexShell>
      <JournalPage />
    </MemexShell>
  );
};

export default RootRoute;
