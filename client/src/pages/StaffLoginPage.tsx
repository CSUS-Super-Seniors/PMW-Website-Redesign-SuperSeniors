import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { SignInResult } from '../auth/AuthContext';
import StaffAuthLayout from '../components/layout/StaffAuthLayout';
import { Button, ErrorBanner, Input } from '../components/ui';
import { routes } from '../config/site';

type StaffLoginPageProps = {
  onSignIn?: (email: string, password: string) => Promise<SignInResult>;
  logoutFailed?: boolean;
};

type FieldErrors = { email?: string; password?: string };
type LoginProblem = Exclude<SignInResult, 'success'>;

const problemMessages: Record<LoginProblem, string> = {
  'wrong-credentials':
    'Email or password is incorrect. Check both and try again, or reset your password.',
  unreachable: 'We could not reach the server. Check your connection and try again.',
};

export default function StaffLoginPage({
  onSignIn = () => Promise.resolve('wrong-credentials'),
  logoutFailed = false,
}: StaffLoginPageProps) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loginProblem, setLoginProblem] = useState<LoginProblem | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') ?? '').trim();
    const password = String(data.get('password') ?? '');

    const nextErrors: FieldErrors = {};
    if (!email) nextErrors.email = 'Enter your email address.';
    if (!password) nextErrors.password = 'Enter your password.';
    setErrors(nextErrors);
    setLoginProblem(null);
    if (nextErrors.email || nextErrors.password) return;

    setSubmitting(true);
    let result: SignInResult;
    try {
      result = await onSignIn(email, password);
    } catch {
      result = 'unreachable';
    } finally {
      setSubmitting(false);
    }

    if (result === 'wrong-credentials') {
      setErrors({ password: 'Check your password and try again.' });
    }
    if (result !== 'success') setLoginProblem(result);
  }

  return (
    <StaffAuthLayout>
      <h1 className="type-h2">Staff login</h1>
      {loginProblem ? (
        <ErrorBanner
          message={problemMessages[loginProblem]}
          onDismiss={() => setLoginProblem(null)}
        />
      ) : logoutFailed ? (
        <ErrorBanner message="Your local session has ended, but we could not confirm logout with the server. Sign in again to continue." />
      ) : (
        <p className="type-body text-neutral-600">For Peterson Mobile Woodworking staff only.</p>
      )}
      <form className="flex flex-col gap-5" noValidate onSubmit={handleSubmit}>
        <Input
          label="Email address"
          type="email"
          name="email"
          placeholder="you@example.com"
          autoComplete="email"
          error={errors.email}
        />
        <Input
          label="Password"
          type="password"
          name="password"
          placeholder="Enter your password"
          autoComplete="current-password"
          error={errors.password}
        />
        <Button type="submit" className="w-full" disabled={submitting}>
          Log in
        </Button>
      </form>
      <Link to={routes.staffForgotPassword} className="type-label text-walnut underline">
        Forgot your password?
      </Link>
    </StaffAuthLayout>
  );
}
