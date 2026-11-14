import { useRef, useState } from 'react';
import { Link } from 'react-router';
import type { InquiryStatus } from '../../api/inquiries';
import {
  declineInquiry,
  type DeclineEmailOutcome,
  type DeclineResult,
  type InquiryDetail,
} from '../../api/inquiryDetail';
import { routes } from '../../config/site';
import { Button, Checkbox, ErrorBanner, Modal, SuccessBanner } from '../ui';

/** Only New and Reviewed requests can be declined. Accepted ones already have a job. */
const declinable: readonly InquiryStatus[] = ['new', 'contacted'];

const linkClass =
  'rounded-sm text-walnut underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber';

/** Why the decline did not save, in the owner's words. */
function declineError(result: Exclude<DeclineResult, { status: 'declined' }>): string {
  switch (result.status) {
    case 'not-found':
      return 'This estimate request no longer exists.';
    case 'unauthenticated':
      return 'Your session is no longer valid. Please log in again.';
    case 'no-access':
      return 'You no longer have permission to decline estimate requests.';
    case 'not-declinable':
      return 'This request was accepted, so it can no longer be declined.';
    default:
      return 'We could not decline this request. Check your connection and try again.';
  }
}

/** What the owner is told about the email once the request is declined. */
function emailNotice(email: DeclineEmailOutcome): { ok: boolean; message: string } {
  switch (email) {
    case 'sent':
      return { ok: true, message: 'We emailed the customer to let them know.' };
    case 'already_sent':
      return { ok: true, message: 'The customer was already emailed about this decline.' };
    case 'skipped':
      return { ok: true, message: 'The customer was not emailed.' };
    case 'no_email':
      return {
        ok: false,
        message:
          'This request has no usable email address, so the customer was not emailed. Contact them another way if they should hear from you.',
      };
    case 'unavailable':
      return {
        ok: false,
        message: 'Email is not available right now, so the customer was not emailed.',
      };
    default:
      return { ok: false, message: 'The email to the customer could not be sent.' };
  }
}

interface DeclineDialogProps {
  inquiry: InquiryDetail;
  accessToken: string | undefined;
  onClose: () => void;
  onDeclined: (email: DeclineEmailOutcome) => void;
  onNotDeclinable: (current: InquiryStatus | null) => void;
}

function DeclineDialog({
  inquiry,
  accessToken,
  onClose,
  onDeclined,
  onNotDeclinable,
}: DeclineDialogProps) {
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const inFlight = useRef(false);
  const hasEmail = Boolean(inquiry.email?.trim());

  async function confirm() {
    if (inFlight.current) return;
    if (!accessToken) {
      setError('Your session is no longer valid. Please log in again.');
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    const result = await declineInquiry(accessToken, inquiry.id, hasEmail && notifyCustomer);
    inFlight.current = false;
    setBusy(false);
    if (result.status === 'declined') onDeclined(result.email);
    else if (result.status === 'not-declinable') onNotDeclinable(result.current);
    else setError(declineError(result));
  }

  // Closing while the decline is saving would hide whether it worked.
  const close = () => {
    if (!inFlight.current) onClose();
  };

  return (
    <Modal isOpen onClose={close} title={`Decline ${inquiry.inquiryNumber}?`}>
      <div className="flex flex-col gap-5">
        <p className="type-body text-dark-brown">
          The request from {inquiry.customerName} will be marked Declined and removed from the
          active estimate requests list.
        </p>

        {hasEmail ? (
          <div>
            <Checkbox
              label="Email the customer that we can't take this request"
              checked={notifyCustomer}
              onChange={(event) => setNotifyCustomer(event.target.checked)}
              disabled={busy}
              aria-describedby="decline-email-address"
            />
            <p id="decline-email-address" className="type-body-sm mt-1 ml-8 break-words">
              <span className="text-neutral-600">Sent to </span>
              {inquiry.email}
            </p>
          </div>
        ) : (
          <p className="type-body-sm text-neutral-600">
            This request has no email address, so the customer won't be emailed.
          </p>
        )}

        {error && <ErrorBanner message={error} />}

        <div aria-busy={busy} className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirm} disabled={busy}>
            {busy ? 'Declining...' : 'Decline request'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export interface InquiryDecisionProps {
  inquiry: InquiryDetail;
  accessToken: string | undefined;
  /** Shows the status the server now reports. */
  onStatusChange: (status: InquiryStatus) => void;
}

/**
 * The Decision section: Decline with a confirmation dialog (SSPMW-172). Accept
 * arrives with SSPMW-156.
 */
export function InquiryDecision({ inquiry, accessToken, onStatusChange }: InquiryDecisionProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<DeclineEmailOutcome | null>(null);
  const [notice, setNotice] = useState<string>();
  const [resending, setResending] = useState(false);
  const canDecline = declinable.includes(inquiry.status);

  function declined(outcome: DeclineEmailOutcome) {
    setOpen(false);
    setEmail(outcome);
    setNotice(undefined);
    onStatusChange('closed');
  }

  function notDeclinable(current: InquiryStatus | null) {
    setOpen(false);
    setNotice('This request was accepted, so it can no longer be declined.');
    if (current) onStatusChange(current);
  }

  // Declining again resends; the server's idempotency key stops a second copy.
  async function resend() {
    if (!accessToken || resending) return;
    setResending(true);
    const result = await declineInquiry(accessToken, inquiry.id, true);
    setResending(false);
    if (result.status === 'declined') setEmail(result.email);
    else setEmail('failed');
  }

  const emailResult = email ? emailNotice(email) : null;

  return (
    <div className="space-y-4">
      {email && emailResult && (
        <>
          <SuccessBanner
            title="Request declined"
            message={emailResult.ok ? emailResult.message : 'It was removed from the active list.'}
          >
            <Link
              to={routes.portalInquiries}
              className={`type-body-sm mt-2 inline-block ${linkClass}`}
            >
              Back to estimate requests
            </Link>
          </SuccessBanner>
          {!emailResult.ok && (
            <ErrorBanner title="Customer not emailed" message={emailResult.message}>
              {(email === 'failed' || email === 'unavailable') && (
                <Button variant="outline" className="mt-3" onClick={resend} disabled={resending}>
                  {resending ? 'Sending...' : 'Try sending the email again'}
                </Button>
              )}
            </ErrorBanner>
          )}
        </>
      )}

      {notice && <ErrorBanner message={notice} />}

      {canDecline ? (
        <>
          <div className="flex flex-wrap gap-3">
            {/* Accept is SSPMW-156 (G3). */}
            <Button variant="secondary" disabled aria-describedby="accept-note">
              Accept
            </Button>
            <Button variant="outline" onClick={() => setOpen(true)}>
              Decline
            </Button>
          </div>
          <p id="accept-note" className="type-body-sm text-neutral-600">
            Accepting requests is coming soon.
          </p>
        </>
      ) : (
        !email &&
        !notice && (
          <p className="type-body text-neutral-600">
            {inquiry.status === 'closed'
              ? 'This request was declined.'
              : 'This request was accepted.'}
          </p>
        )
      )}

      {open && (
        <DeclineDialog
          inquiry={inquiry}
          accessToken={accessToken}
          onClose={() => setOpen(false)}
          onDeclined={declined}
          onNotDeclinable={notDeclinable}
        />
      )}
    </div>
  );
}
