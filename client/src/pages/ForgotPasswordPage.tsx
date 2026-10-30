import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { isValidEmail, type ResetRequestResult } from '../auth/passwordReset';
import StaffAuthLayout from '../components/layout/StaffAuthLayout';
import { Button, ErrorBanner, Input, SuccessBanner } from '../components/ui';
import { routes } from '../config/site';

type ForgotPasswordPageProps = {
  onRequestReset: (email: string) => Promise<ResetRequestResult>;
};

type RequestProblem = Exclude<ResetRequestResult, 'success'>;

const problemMessages: Record<RequestProblem, string> = {
  'rate-limited': 'Too many reset requests in a short time. Wait a few minutes and try again.',
  unreachable: 'We could not reach the server. Check your connection and try again.',
  failed: 'We could not send the reset link. Try again in a minute.',
};

/** Forgot password page from the Figma "Forgot password" frames (SSPMW-310). */
export default function ForgotPasswordPage({ onRequestReset }: ForgotPasswordPageProps) {
  const navigate = useNavigate();
  const [emailError, setEmailError] = useState<string>();
  const [problem, setProblem] = useState<RequestProblem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [showSentBanner, setShowSentBanner] = useState(true);
  const sentHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // The form disappears once the link is sent, so move focus to the new heading.
    if (sentTo) sentHeadingRef.current?.focus();
  }, [sentTo]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get('email') ?? '').trim();

    setProblem(null);
    if (!email) {
      setEmailError('Enter your email address.');
      return;
    }
    if (!isValidEmail(email)) {
      setEmailError('Enter a full email address, like name@example.com.');
      return;
    }
    setEmailError(undefined);

    setSubmitting(true);
    let result: ResetRequestResult;
    try {
      result = await onRequestReset(email);
    } catch {
      result = 'unreachable';
    } finally {
      setSubmitting(false);
    }

    if (result === 'success') {
      setShowSentBanner(true);
      setSentTo(email);
    } else {
      setProblem(result);
    }
  }

  if (sentTo) {
    return (
      <StaffAuthLayout>
        <h1 ref={sentHeadingRef} tabIndex={-1} className="type-h2 outline-none">
          Check your email
        </h1>
        {showSentBanner && (
          <SuccessBanner
            title="Reset link sent"
            message={`If ${sentTo} has a staff account, a link to reset the password is on its way. The link works for 1 hour.`}
            onDismiss={() => setShowSentBanner(false)}
          />
        )}
        <Button
          variant="outline"
          className="w-full"
          onClick={() => navigate(routes.staffLogin, { replace: true })}
        >
          Back to log in
        </Button>
      </StaffAuthLayout>
    );
  }

  return (
    <StaffAuthLayout>
      <h1 className="type-h2">Reset your password</h1>
      {problem ? (
        <ErrorBanner message={problemMessages[problem]} onDismiss={() => setProblem(null)} />
      ) : (
        <p className="type-body text-neutral-600">
          Enter your email and we will send you a link to make a new password.
        </p>
      )}
      <form className="flex flex-col gap-5" noValidate onSubmit={handleSubmit}>
        <Input
          label="Email address"
          type="email"
          name="email"
          placeholder="you@example.com"
          autoComplete="email"
          error={emailError}
        />
        <Button type="submit" className="w-full" disabled={submitting}>
          Send reset link
        </Button>
      </form>
      <Link to={routes.staffLogin} className="type-label text-walnut underline">
        Back to log in
      </Link>
    </StaffAuthLayout>
  );
}
