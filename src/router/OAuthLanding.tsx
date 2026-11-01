import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { clearRememberedNextPath, readRememberedNextPath } from "../utils/authRedirect";

/**
 * `/dashboard`: where GitHub OAuth returns (the URL allow-listed in Supabase
 * Auth). Continues to the page the sign-in started from, else the Journal.
 */
const OAuthLanding = () => {
  const next = readRememberedNextPath();
  useEffect(() => clearRememberedNextPath(), []);
  return <Navigate to={next} replace />;
};

export default OAuthLanding;
