import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useSession } from '../../context/SessionContext';
import { repository } from '../../data/repository';
import { DEFAULT_MODULE_PATH } from '../../constants/modules';
import CardsAuthForm from './CardsAuthForm';

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
    <CardsAuthForm
      title="Make an account"
      mode="sign-up"
      values={formValues}
      onChange={handleInputChange}
      onSubmit={handleSubmit}
      onGitHub={handleGitHubSignUp}
      submitLabel="Make my account"
      submitting={status.includes('Creating')}
      githubBusy={status.includes('GitHub')}
      disabled={isSubmitting}
      error={showMessage && !isSuccess ? status : null}
      success={showMessage && isSuccess ? status : null}
      footer={
        <Link to="/auth/sign-in" className="mc-auth-link">
          Have an account? <strong>Sign in</strong>
        </Link>
      }
    />
  );
};

export default SignUpPage;
