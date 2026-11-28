import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { MIN_PASSWORD_LENGTH, type UpdatePasswordResult } from '../auth/passwordReset';
import StaffAuthLayout from '../components/layout/StaffAuthLayout';
import { Button, ErrorBanner, Input, SuccessBanner } from '../components/ui';
import { routes } from '../config/site';

type View = 'form' | 'expired' | 'success';

/** `reset` opens from a password reset email; `invite` from the staff invite email (SSPMW-271). */
export type PasswordPageMode = 'reset' | 'invite';

const copy = {
  reset: {
    heading: 'Choose a new password',
    passwordLabel: 'New password',
    passwordPlaceholder: 'Enter a new password',
    missingPassword: 'Enter a new password.',
    saveLabel: 'Save new password',
    failed: 'We could not save your new password. Try again.',
    successHeading: 'Password changed',
    successTitle: 'Your new password is saved',
    successMessage: 'Log in with your new password to continue.',
    expiredTitle: 'This reset link has expired',
    expiredMessage: 'Reset links work for 1 hour. Send a new one to continue.',
  },
  invite: {
    heading: 'Set your password',
    passwordLabel: 'Password',
    passwordPlaceholder: 'Enter a password',
    missingPassword: 'Enter a password.',
    saveLabel: 'Save password',
    failed: 'We could not save your password. Try again.',
    successHeading: 'Password set',
    successTitle: 'Your password is saved',
    successMessage: 'Log in with your email and new password to use the staff portal.',
    expiredTitle: 'This invite link has expired',
    expiredMessage:
      'Invite links work for 1 hour. Ask the owner who invited you to send a new invite.',
  },
} as const;

type ResetPasswordPageProps = {
  /** Which email opened the page. Defaults to a password reset. */
  mode?: PasswordPageMode;
  /** Whether the reset link was valid when the page opened. Later changes are ignored. */
  linkValid: boolean;
  onSave: (password: string) => Promise<UpdatePasswordResult>;
};

type FieldErrors = { password?: string; confirm?: string };
type SaveProblem = 'unreachable' | 'failed';

const UNREACHABLE_MESSAGE = 'We could not reach the server. Check your connection and try again.';

/**
 * Reset password page from the Figma "Reset password" frames (SSPMW-313). The
 * invite email's Set password page (SSPMW-271) is the same screen with its own words.
 */
export default function ResetPasswordPage({
  mode = 'reset',
  linkValid,
  onSave,
}: ResetPasswordPageProps) {
  const text = copy[mode];
  const navigate = useNavigate();
  // The view is set once from the link and then only by what happens on this
  // page. Signing out after a successful save must not flip it to "expired".
  const [view, setView] = useState<View>(linkValid ? 'form' : 'expired');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [problem, setProblem] = useState<SaveProblem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showBanner, setShowBanner] = useState(true);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusedView = useRef(view);

  useEffect(() => {
    // Move focus to the new heading when the page switches state, so screen
    // readers announce it. The first view keeps the browser's default focus.
    if (focusedView.current === view) return;
    focusedView.current = view;
    headingRef.current?.focus();
  }, [view]);

  function showView(next: View) {
    setShowBanner(true);
    setView(next);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get('password') ?? '');
    const confirm = String(data.get('confirm') ?? '');

    const nextErrors: FieldErrors = {};
    if (!password) nextErrors.password = text.missingPassword;
    else if (password.length < MIN_PASSWORD_LENGTH)
      nextErrors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    if (!confirm) nextErrors.confirm = 'Type the same password again.';
    else if (password && confirm !== password)
      nextErrors.confirm = 'The two passwords do not match. Type the same password in both boxes.';
    setErrors(nextErrors);
    setProblem(null);
    if (nextErrors.password || nextErrors.confirm) return;

    setSubmitting(true);
    let result: UpdatePasswordResult;
    try {
      result = await onSave(password);
    } catch {
      result = 'unreachable';
    } finally {
      setSubmitting(false);
    }

    if (result === 'success') showView('success');
    else if (result === 'expired') showView('expired');
    else if (result === 'same-password')
      setErrors({ password: 'This is already your password. Choose a different one.' });
    else if (result === 'weak-password')
      setErrors({
        password:
          'This password is too easy to guess. Try a longer one with a mix of letters and numbers.',
      });
    else setProblem(result);
  }

  if (view === 'success') {
    return (
      <StaffAuthLayout>
        <h1 ref={headingRef} tabIndex={-1} className="type-h2 outline-none">
          {text.successHeading}
        </h1>
        {showBanner && (
          <SuccessBanner
            title={text.successTitle}
            message={text.successMessage}
            onDismiss={() => setShowBanner(false)}
          />
        )}
        <Button className="w-full" onClick={() => navigate(routes.staffLogin, { replace: true })}>
          Log in
        </Button>
      </StaffAuthLayout>
    );
  }

  if (view === 'expired') {
    return (
      <StaffAuthLayout>
        <h1 ref={headingRef} tabIndex={-1} className="type-h2 outline-none">
          {text.heading}
        </h1>
        {showBanner && (
          <ErrorBanner
            title={text.expiredTitle}
            message={text.expiredMessage}
            onDismiss={() => setShowBanner(false)}
          />
        )}
        {/* A new invite has to come from an owner (Add employee sends it again), so the
            invite screen offers no self-serve link. Forgot password is for set passwords. */}
        {mode === 'reset' && (
          <Button
            className="w-full"
            onClick={() => navigate(routes.staffForgotPassword, { replace: true })}
          >
            Send a new link
          </Button>
        )}
        <Link to={routes.staffLogin} className="type-label text-walnut underline">
          Back to log in
        </Link>
      </StaffAuthLayout>
    );
  }

  return (
    <StaffAuthLayout>
      <h1 ref={headingRef} tabIndex={-1} className="type-h2 outline-none">
        {text.heading}
      </h1>
      {problem && (
        <ErrorBanner
          message={problem === 'unreachable' ? UNREACHABLE_MESSAGE : text.failed}
          onDismiss={() => setProblem(null)}
        />
      )}
      <form className="flex flex-col gap-5" noValidate onSubmit={handleSubmit}>
        <Input
          label={text.passwordLabel}
          type="password"
          name="password"
          placeholder={text.passwordPlaceholder}
          autoComplete="new-password"
          hint={`Use at least ${MIN_PASSWORD_LENGTH} characters.`}
          error={errors.password}
        />
        <Input
          label="Type it again"
          type="password"
          name="confirm"
          placeholder="Enter the same password"
          autoComplete="new-password"
          error={errors.confirm}
        />
        <Button type="submit" className="w-full" disabled={submitting}>
          {text.saveLabel}
        </Button>
      </form>
    </StaffAuthLayout>
  );
}
