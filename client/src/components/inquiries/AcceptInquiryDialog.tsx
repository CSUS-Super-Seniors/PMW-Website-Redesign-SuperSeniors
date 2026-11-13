import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { acceptInquiry, type AcceptedJob, type AcceptInquiryResult } from '../../api/acceptInquiry';
import { useAuth } from '../../auth/AuthContext';
import { Button, ConfirmationDialog, Modal } from '../ui';

export interface AcceptInquiryDialogProps {
  inquiryId: string;
  isOpen: boolean;
  onClose: () => void;
  /** Lets the page behind the dialog refresh once the job exists. */
  onAccepted?: (job: AcceptedJob) => void;
}

const failureMessages: Record<Exclude<AcceptInquiryResult['status'], 'ok'>, string> = {
  unauthenticated: 'Your session has expired. Please sign in again.',
  'no-access': 'Only an owner can accept estimate requests.',
  'not-found': 'This estimate request could not be found. It may have been removed.',
  'not-acceptable': 'This estimate request was already accepted or declined.',
  error: 'The request could not be accepted. Please try again.',
};

const linkStyles =
  'type-button inline-flex min-h-11 items-center justify-center rounded-sm bg-dark-brown px-5 py-2 text-white transition-colors hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber';

export function AcceptInquiryDialog(props: AcceptInquiryDialogProps) {
  // The body only exists while the dialog is open, so every opening starts fresh.
  if (!props.isOpen) return null;
  return <AcceptInquiryDialogBody {...props} />;
}

function AcceptInquiryDialogBody({ inquiryId, onClose, onAccepted }: AcceptInquiryDialogProps) {
  const { session } = useAuth();
  const [error, setError] = useState<string>();
  const [job, setJob] = useState<AcceptedJob | null>(null);
  const accepting = useRef(false);

  async function handleConfirm() {
    const token = session?.access_token;
    if (!token) {
      setError(failureMessages.unauthenticated);
      return;
    }
    accepting.current = true;
    setError(undefined);
    try {
      const result = await acceptInquiry(token, inquiryId);
      if (result.status === 'ok') {
        setJob(result.job);
        onAccepted?.(result.job);
        return;
      }
      setError(failureMessages[result.status]);
    } finally {
      accepting.current = false;
    }
  }

  // Escape and a click outside also cancel, so they are ignored while the request is running.
  function handleCancel() {
    if (!accepting.current) onClose();
  }

  if (job) {
    return (
      <Modal isOpen onClose={onClose} title="Estimate request accepted">
        <div className="flex flex-col gap-6">
          <p className="type-body text-dark-brown">
            Job {job.jobNumber} was created. The customer&apos;s details, notes and photos were
            carried over.
          </p>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
            <Link
              to={`/portal/jobs/${encodeURIComponent(job.jobNumber)}`}
              onClick={onClose}
              className={linkStyles}
            >
              View job
            </Link>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <ConfirmationDialog
      isOpen
      onCancel={handleCancel}
      onConfirm={handleConfirm}
      title="Accept this estimate request?"
      message="This creates a job for the customer and carries over their details, notes and photos. If they are already a customer, the job is added to their record."
      confirmLabel="Accept"
      confirmingLabel="Accepting..."
      error={error}
    />
  );
}
