import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useSession } from '../../context/SessionContext';
import supabase from '../../supabase';
import AppLogo from '../../components/AppLogo';
import DarkModeToggle from '../../components/DarkModeToggle';
import { nextPathFromSearch, rememberNextPath } from '../../utils/authRedirect';

const GitHubIcon = () => (
  <svg width="18" height="18" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
    <path
      fillRule="evenodd"
      d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z"
      clipRule="evenodd"
    />
  </svg>
);

const SignInPage = () => {
  const { session } = useSession();
  const location = useLocation();
  // The page that sent you here (`?next=`); signing in returns to it.
  const nextPath = nextPathFromSearch(location.search);
  const [status, setStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formValues, setFormValues] = useState({
    email: '',
    password: '',
  });

  if (session) return <Navigate to={nextPath} replace />;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormValues({ ...formValues, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatus('Logging in…');
    const { error } = await supabase.auth.signInWithPassword({
      email: formValues.email,
      password: formValues.password,
    });
    if (error) {
      setStatus(error.message);
      setIsSubmitting(false);
    } else {
      setStatus('');
      setIsSubmitting(false);
    }
  };

  const handleGitHubSignIn = async () => {
    setIsSubmitting(true);
    setStatus('Redirecting to GitHub…');
    rememberNextPath(nextPath);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    });
    if (error) {
      setStatus(error.message);
      setIsSubmitting(false);
    }
  };

  const showError =
    status &&
    !status.includes('Logging') &&
    !status.includes('GitHub');

  return (
    <div className="app-surface page-shell">
      <div className="page-center">
        <div className="page-card">
          <header className="page-card-header">
            <div className="page-card-header-row">
              <div>
                <AppLogo />
                <h1 className="page-card-title">Sign in</h1>
              </div>
              <DarkModeToggle />
            </div>
            <p className="page-muted">Access your notes, links, tasks, and spaces</p>
          </header>

          <form onSubmit={handleSubmit} className="page-card-section">
            <div className="app-field">
              <label className="app-field-label" htmlFor="sign-in-email">
                Email
              </label>
              <input
                id="sign-in-email"
                name="email"
                value={formValues.email}
                onChange={handleInputChange}
                type="email"
                autoComplete="email"
                className="input-field"
                required
              />
            </div>
            <div className="app-field">
              <label className="app-field-label" htmlFor="sign-in-password">
                Password
              </label>
              <input
                id="sign-in-password"
                name="password"
                value={formValues.password}
                onChange={handleInputChange}
                type="password"
                autoComplete="current-password"
                className="input-field"
                required
              />
            </div>
            <button
              type="submit"
              className="btn-primary w-full"
              disabled={isSubmitting}
            >
              {status.includes('Logging') ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="page-card-section">
            <div className="app-divider">or</div>
            <button
              type="button"
              onClick={handleGitHubSignIn}
              className="btn-secondary w-full"
              disabled={isSubmitting}
            >
              <GitHubIcon />
              {status.includes('GitHub') ? 'Redirecting…' : 'Continue with GitHub'}
            </button>
          </div>

          <div className="page-card-section">
            <Link to="/auth/sign-up" className="app-text-link">
              Don&apos;t have an account? <strong>Create one</strong>
            </Link>
          </div>

          {showError && (
            <div className="app-alert is-error" role="alert">
              {status}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SignInPage;
