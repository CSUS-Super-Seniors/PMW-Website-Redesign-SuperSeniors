import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import Logo from '../components/brand/Logo';
import { Button, Checkbox, ErrorBanner, Input } from '../components/ui';
import { routes } from '../config/site';

type StaffLoginPageProps = {
  onSignIn?: (email: string, password: string) => Promise<boolean>;
};

type FieldErrors = { email?: string; password?: string };

export default function StaffLoginPage({
  onSignIn = () => Promise.resolve(false),
}: StaffLoginPageProps) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loginFailed, setLoginFailed] = useState(false);
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
    setLoginFailed(false);
    if (nextErrors.email || nextErrors.password) return;

    setSubmitting(true);
    const signedIn = await onSignIn(email, password);
    setSubmitting(false);
    if (!signedIn) {
      setLoginFailed(true);
      setErrors({ password: 'Check your password and try again.' });
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center gap-6 bg-neutral-100 px-4 py-10 md:justify-center md:gap-8">
      <Logo className="h-11 w-auto" />
      <div className="flex w-full max-w-110 flex-col gap-5 rounded-lg border border-neutral-300 bg-white p-6 md:p-10">
        <h1 className="type-h2">Staff login</h1>
        {loginFailed ? (
          <ErrorBanner
            message="Email or password is incorrect. Check both and try again, or reset your password."
            onDismiss={() => setLoginFailed(false)}
          />
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
          <Checkbox label="Keep me logged in on this device" />
          <Button type="submit" className="w-full" disabled={submitting}>
            Log in
          </Button>
        </form>
        <Link to={routes.staffForgotPassword} className="type-label text-walnut underline">
          Forgot your password?
        </Link>
      </div>
      <Link to={routes.home} className="type-label text-walnut underline">
        Back to the public site
      </Link>
    </main>
  );
}
