import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { MIN_PASSWORD_LENGTH, type UpdatePasswordResult } from '../auth/passwordReset';
import StaffAuthLayout from '../components/layout/StaffAuthLayout';
import { Button, ErrorBanner, Input, SuccessBanner } from '../components/ui';
import { routes } from '../config/site';

type View = 'form' | 'expired' | 'success';

type ResetPasswordPageProps = {
  /** Whether the reset link was valid when the page opened. Later changes are ignored. */
  linkValid: boolean;
  onSave: (password: string) => Promise<UpdatePasswordResult>;
};

type FieldErrors = { password?: string; confirm?: string };
type SaveProblem = 'unreachable' | 'failed';

const problemMessages: Record<SaveProblem, string> = {
  unreachable: 'We could not reach the server. Check your connection and try again.',
  failed: 'We could not save your new password. Try again.',
};

/** Reset password page from the Figma "Reset password" frames (SSPMW-313). */
export default function ResetPasswordPage({ linkValid, onSave }: ResetPasswordPageProps) {
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
    if (!password) nextErrors.password = 'Enter a new password.';
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
          Password changed
        </h1>
        {showBanner && (
          <SuccessBanner
            title="Your new password is saved"
            message="Log in with your new password to continue."
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
          Choose a new password
        </h1>
        {showBanner && (
          <ErrorBanner
            title="This reset link has expired"
            message="Reset links work for 1 hour. Send a new one to continue."
            onDismiss={() => setShowBanner(false)}
          />
        )}
        <Button
          className="w-full"
          onClick={() => navigate(routes.staffForgotPassword, { replace: true })}
        >
          Send a new link
        </Button>
        <Link to={routes.staffLogin} className="type-label text-walnut underline">
          Back to log in
        </Link>
      </StaffAuthLayout>
    );
  }

  return (
    <StaffAuthLayout>
      <h1 ref={headingRef} tabIndex={-1} className="type-h2 outline-none">
        Choose a new password
      </h1>
      {problem && (
        <ErrorBanner message={problemMessages[problem]} onDismiss={() => setProblem(null)} />
      )}
      <form className="flex flex-col gap-5" noValidate onSubmit={handleSubmit}>
        <Input
          label="New password"
          type="password"
          name="password"
          placeholder="Enter a new password"
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
          Save new password
        </Button>
      </form>
    </StaffAuthLayout>
  );
}
