import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useSession } from '../../context/SessionContext';
import { repository } from '../../data/repository';
import AppLogo from '../../components/AppLogo';
import DarkModeToggle from '../../components/DarkModeToggle';
import { DEFAULT_MODULE_PATH } from '../../constants/modules';

const GitHubIcon = () => (
  <svg
    width="18"
    height="18"
    fill="currentColor"
    viewBox="0 0 20 20"
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z"
      clipRule="evenodd"
    />
  </svg>
);

const SignUpPage = () => {
  const { session } = useSession();
  const [status, setStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formValues, setFormValues] = useState({
    email: '',
    password: '',
  });

  if (session) return <Navigate to={DEFAULT_MODULE_PATH} replace />;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormValues({ ...formValues, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatus('Creating account…');
    const { error } = await repository.auth.signUp({
      email: formValues.email,
      password: formValues.password,
    });
    if (error) {
      setStatus(error.message);
    } else {
      setStatus('Check your email for a confirmation link.');
    }
    setIsSubmitting(false);
  };

  const handleGitHubSignUp = async () => {
    setIsSubmitting(true);
    setStatus('Redirecting to GitHub…');
    const { error } = await repository.auth.signInWithOAuth('github', {
      redirectTo: `${window.location.origin}/dashboard`,
    });
    if (error) {
      setStatus(error.message);
      setIsSubmitting(false);
    }
  };

  const isSuccess = status.includes('email');
  const showMessage =
    status && !status.includes('Creating') && !status.includes('GitHub');

  return (
    <div className="app-surface page-shell">
      <div className="page-center">
        <div className="page-card">
          <div className="page-card-section">
            <Link to="/" className="btn-secondary btn-compact">
              ← Back
            </Link>
          </div>

          <header className="page-card-header">
            <div className="page-card-header-row">
              <div>
                <AppLogo />
                <h1 className="page-card-title">Create account</h1>
              </div>
              <DarkModeToggle />
            </div>
            <p className="page-muted">Start organizing links with memex</p>
          </header>

          <form onSubmit={handleSubmit} className="page-card-section">
            <div className="app-field">
              <label className="app-field-label" htmlFor="sign-up-email">
                Email
              </label>
              <input
                id="sign-up-email"
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
              <label className="app-field-label" htmlFor="sign-up-password">
                Password
              </label>
              <input
                id="sign-up-password"
                name="password"
                value={formValues.password}
                onChange={handleInputChange}
                type="password"
                autoComplete="new-password"
                className="input-field"
                required
                minLength={6}
              />
            </div>
            <button
              type="submit"
              className="btn-primary w-full"
              disabled={isSubmitting}
            >
              {status.includes('Creating')
                ? 'Creating account…'
                : 'Create account'}
            </button>
          </form>

          <div className="page-card-section">
            <div className="app-divider">or</div>
            <button
              type="button"
              onClick={handleGitHubSignUp}
              className="btn-secondary w-full"
              disabled={isSubmitting}
            >
              <GitHubIcon />
              {status.includes('GitHub')
                ? 'Redirecting…'
                : 'Continue with GitHub'}
            </button>
          </div>

          <div className="page-card-section">
            <Link to="/auth/sign-in" className="app-text-link">
              Already have an account? <strong>Sign in</strong>
            </Link>
          </div>

          {showMessage && (
            <div
              className={`app-alert ${isSuccess ? 'is-success' : 'is-error'}`}
              role="alert"
            >
              {status}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SignUpPage;
