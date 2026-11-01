import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useSession } from "../context/SessionContext";
import { signInPathFor } from "../utils/authRedirect";

/** Signed out → sign-in, which brings you back to the page you asked for. */
const AuthProtectedRoute = () => {
  const { session, authHydrated } = useSession();
  const location = useLocation();
  if (!authHydrated) {
    return null;
  }
  if (!session) {
    const requested = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={signInPathFor(requested)} replace />;
  }
  return <Outlet />;
};

export default AuthProtectedRoute;
