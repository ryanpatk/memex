import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useSession } from '../../context/SessionContext';
import { repository } from '../../data/repository';
import { nextPathFromSearch, rememberNextPath } from '../../utils/authRedirect';
import CardsAuthForm from './CardsAuthForm';

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
    const { error } = await repository.auth.signInWithPassword({
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
    const { error } = await repository.auth.signInWithOAuth('github', {
      redirectTo: `${window.location.origin}/dashboard`,
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
    <CardsAuthForm
      title="Welcome back"
      mode="sign-in"
      values={formValues}
      onChange={handleInputChange}
      onSubmit={handleSubmit}
      onGitHub={handleGitHubSignIn}
      submitLabel="Sign in"
      submitting={status.includes('Logging')}
      githubBusy={status.includes('GitHub')}
      disabled={isSubmitting}
      error={showError ? status : null}
      footer={
        <Link to="/auth/sign-up" className="mc-auth-link">
          New here? <strong>Make an account</strong>
        </Link>
      }
    />
  );
};

export default SignInPage;
