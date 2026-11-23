import { useEffect, useRef, useState } from 'react';
import {
  ESTIMATE_HONEYPOT_FIELD,
  estimateSubmissionSchema,
  type EstimateStep1Data,
  type EstimateStep1Input,
} from '@pmw/validation';
import EstimateStep1Form, {
  type EstimateSpamCheck,
} from '../components/estimate/EstimateStep1Form';
import EstimatePhotosStep from '../components/estimate/EstimatePhotosStep';
import EstimateReviewStep, {
  type EstimateReviewSection,
} from '../components/estimate/EstimateReviewStep';
import EstimateSubmission from '../components/estimate/EstimateSubmission';
import { ConfirmationDialog } from '../components/ui';
import { useEstimatePhotos } from '../lib/useEstimatePhotos';
import { useEstimateLeaveGuard } from '../lib/useEstimateLeaveGuard';
import type { EstimatePhotoHandoff } from '../lib/estimatePhotos';

interface EstimateDetailsHandoff {
  details: EstimateStep1Data;
  spamCheck: EstimateSpamCheck;
}

export type EstimateRequestHandoff = EstimatePhotoHandoff & EstimateDetailsHandoff;

export default function EstimateRequestPage() {
  const [hasDetails, setHasDetails] = useState(false);
  const [requestDetails, setRequestDetails] = useState<EstimateDetailsHandoff | null>(null);
  const [step, setStep] = useState<'details' | 'photos' | 'review'>('details');
  const [photoHandoff, setPhotoHandoff] = useState<EstimatePhotoHandoff | null>(null);
  const [returnToReview, setReturnToReview] = useState(false);
  const [focusField, setFocusField] = useState<keyof EstimateStep1Input>();
  const { photos, addPhotos, removePhoto, resetPhotos, uploadPhotos } = useEstimatePhotos();
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const { blocker, markSubmitted, startNewRequest } = useEstimateLeaveGuard(
    hasDetails || photos.length > 0,
  );
  const submissionId = useRef<{ payload: string; id: string } | null>(null);
  const submissionInFlight = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (step === 'review') {
      reviewHeadingRef.current?.focus({ preventScroll: true });
      reviewHeadingRef.current?.scrollIntoView?.({ block: 'start' });
      return;
    }
    if (step === 'details' && focusField) return;
    headingRef.current?.focus();
  }, [step, focusField]);

  function continueFromDetails(details: EstimateStep1Data, spamCheck: EstimateSpamCheck) {
    // The form only continues after field validation and service-area approval.
    setRequestDetails({ details, spamCheck });
    setStep(returnToReview && photoHandoff ? 'review' : 'photos');
  }

  function editSection(section: EstimateReviewSection) {
    setReturnToReview(true);
    setFocusField(
      section === 'contact'
        ? 'first_name'
        : section === 'address'
          ? 'address'
          : section === 'repair'
            ? 'item'
            : section === 'source'
              ? 'lead_source'
              : undefined,
    );
    setStep(section === 'photos' ? 'photos' : 'details');
  }

  async function submitRequest() {
    if (submissionInFlight.current) throw new Error('Your request is already being sent.');
    if (!requestDetails || !photoHandoff) {
      throw new Error('Return to your request details and try again.');
    }

    submissionInFlight.current = true;
    try {
      const request = {
        ...requestDetails.details,
        photoSession: photoHandoff.photoSession,
        photos: photoHandoff.photos,
      };
      const payloadKey = JSON.stringify({
        ...request,
        [ESTIMATE_HONEYPOT_FIELD]: requestDetails.spamCheck[ESTIMATE_HONEYPOT_FIELD],
      });
      const submission_id =
        submissionId.current?.payload === payloadKey
          ? submissionId.current.id
          : crypto.randomUUID();
      const parsed = estimateSubmissionSchema.safeParse({ ...request, submission_id });
      if (!parsed.success) {
        throw new Error(
          parsed.error.issues[0]?.message ?? 'Please check your estimate request and try again.',
        );
      }
      submissionId.current = { payload: payloadKey, id: submission_id };

      const response = await fetch('/api/estimates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...parsed.data,
          [ESTIMATE_HONEYPOT_FIELD]: requestDetails.spamCheck[ESTIMATE_HONEYPOT_FIELD],
        }),
      });
      let responseBody: unknown;
      try {
        responseBody = await response.json();
      } catch {
        throw new Error(
          response.ok
            ? 'We could not confirm that your request was submitted. Please retry.'
            : 'We could not send your request. Please check your connection and try again.',
        );
      }

      if (!response.ok) {
        const message =
          typeof responseBody === 'object' &&
          responseBody !== null &&
          'error' in responseBody &&
          typeof responseBody.error === 'string'
            ? responseBody.error
            : 'We could not send your request. Your information is still in the form. Please try again.';
        throw new Error(message);
      }
      if (
        typeof responseBody !== 'object' ||
        responseBody === null ||
        !('success' in responseBody) ||
        responseBody.success !== true ||
        !('inquiry_number' in responseBody) ||
        typeof responseBody.inquiry_number !== 'string'
      ) {
        throw new Error(
          'We could not confirm that your request was submitted. Please retry the same request.',
        );
      }
    } finally {
      submissionInFlight.current = false;
    }
  }

  function startAnotherRequest() {
    setSubmitted(false);
    setHasDetails(false);
    setRequestDetails(null);
    setStep('details');
    setPhotoHandoff(null);
    setReturnToReview(false);
    setFocusField(undefined);
    setConfirmationOpen(false);
    setFormKey((key) => key + 1);
    resetPhotos();
    submissionId.current = null;
    startNewRequest();
  }

  return (
    <main className="flex-1 bg-neutral-50">
      {!submitted && (
        <div className="mx-auto w-full max-w-content px-4 py-8 md:px-8 md:py-12">
          <p className="type-overline text-amber-dark">
            {step === 'details' ? 'Step 1 of 4' : step === 'photos' ? 'Step 2 of 4' : 'Step 3 of 4'}
          </p>
          <h1 ref={headingRef} tabIndex={-1} className="type-h2 mt-4 md:type-h1">
            Request an estimate
          </h1>
          {step === 'details' && (
            <>
              <p className="type-body-lg mt-4 max-w-200 text-neutral-600">
                Tell us about the item and how we can reach you. Photos are optional and can be
                added on the next step.
              </p>
              <div className="mt-6 md:mt-8">
                <EstimateStep1Form
                  key={formKey}
                  initialValues={requestDetails?.details}
                  initialSpamCheck={requestDetails?.spamCheck}
                  onHasDataChange={setHasDetails}
                  initialFocusField={focusField}
                  continueLabel={returnToReview && photoHandoff ? 'Return to review' : undefined}
                  onContinue={continueFromDetails}
                />
              </div>
              <p className="type-body-sm mt-6 text-neutral-600">
                {returnToReview && photoHandoff
                  ? 'Your photos are kept while you edit your details.'
                  : 'Next: add optional photos so we can better understand the repair.'}
              </p>
            </>
          )}
          {step === 'photos' && (
            <div className="mt-6">
              <EstimatePhotosStep
                photos={photos}
                onAdd={(files) => {
                  setPhotoHandoff(null);
                  addPhotos(files);
                }}
                onRemove={(id) => {
                  setPhotoHandoff(null);
                  removePhoto(id);
                }}
                onBack={() => {
                  setFocusField(undefined);
                  setStep('details');
                }}
                onContinue={async () => {
                  if (!requestDetails) throw new Error('Return to your details and try again.');
                  setPhotoHandoff(await uploadPhotos());
                  setStep('review');
                }}
              />
            </div>
          )}
          {step === 'review' && requestDetails && photoHandoff && (
            <div className="mt-6">
              <EstimateReviewStep
                headingRef={reviewHeadingRef}
                details={requestDetails.details}
                photos={photos.filter((photo) => photo.status === 'ready')}
                onEdit={editSection}
                onSubmit={() => setConfirmationOpen(true)}
              />
            </div>
          )}
        </div>
      )}
      <EstimateSubmission
        firstName={requestDetails?.details.first_name ?? ''}
        onSubmit={submitRequest}
        onStartAnother={startAnotherRequest}
        isOpen={confirmationOpen}
        onClose={() => setConfirmationOpen(false)}
        onSubmitted={() => {
          markSubmitted();
          setSubmitted(true);
        }}
      />
      <ConfirmationDialog
        isOpen={blocker.state === 'blocked'}
        title="Discard request?"
        message="If you leave now, your entered details and selected photos will be lost."
        confirmLabel="Discard"
        cancelLabel="Cancel"
        destructive
        onCancel={() => {
          if (blocker.state === 'blocked') blocker.reset();
        }}
        onConfirm={() => {
          // Leaving unmounts this page and clears its draft, photos and session.
          // Uploaded, unattached objects follow the existing cleanup policy.
          if (blocker.state === 'blocked') blocker.proceed();
        }}
      />
    </main>
  );
}
