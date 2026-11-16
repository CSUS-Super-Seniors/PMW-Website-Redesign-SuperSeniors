import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../ui/Button';
import { ConfirmationDialog } from '../ui/ConfirmationDialog';
import { routes } from '../../config/site';

interface EstimateSubmissionProps {
  firstName: string;
  onSubmit: () => Promise<void>;
  onStartAnother: () => void;
}

export default function EstimateSubmission({
  firstName,
  onSubmit,
  onStartAnother,
}: EstimateSubmissionProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const submitting = useRef(false);

  async function handleSubmit() {
    if (submitting.current || submitted) return;

    submitting.current = true;
    setSubmitError('');

    try {
      await onSubmit();
      setSubmitted(true);
      setConfirmOpen(false);
    } catch {
      setSubmitError(
        'We could not send your request. Your information is still in the form. Please try again.',
      );
    } finally {
      submitting.current = false;
    }
  }

  function handleCancel() {
    setConfirmOpen(false);
    setSubmitError('');
  }

  function handleStartAnother() {
    onStartAnother();
    setSubmitted(false);
    setSubmitError('');
  }

  if (submitted) {
    return (
      <section className="mx-auto w-full max-w-190 rounded-xl border border-neutral-300 bg-white p-6 md:p-8">
        <p className="type-overline text-amber-dark">Step 4 of 4</p>

        <h1 className="type-h2 mt-4">Thanks, {firstName.trim()}!</h1>

        <p className="type-body mt-4 text-neutral-600">
          Your estimate request has been submitted successfully. We will contact you about the next
          steps.
        </p>

        <div className="mt-8 flex flex-col gap-4 sm:flex-row">
          <Button onClick={handleStartAnother}>Start another request</Button>

          <Link
            to={routes.home}
            className="type-button inline-flex min-h-11 items-center justify-center rounded-sm border border-dark-brown px-5 py-2 text-dark-brown"
          >
            Return home
          </Link>
        </div>
      </section>
    );
  }

  return (
    <>
      <Button onClick={() => setConfirmOpen(true)}>Submit request</Button>

      <ConfirmationDialog
        isOpen={confirmOpen}
        onCancel={handleCancel}
        onConfirm={handleSubmit}
        title="Submit estimate request?"
        message="Are you sure you want to send your estimate request?"
        confirmLabel="Submit request"
        cancelLabel="Cancel"
        confirmingLabel="Sending..."
        error={submitError || undefined}
      />
    </>
  );
}
