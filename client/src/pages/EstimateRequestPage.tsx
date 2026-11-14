import { useEffect, useRef, useState } from 'react';
import type { EstimateStep1Data, EstimateStep1Input } from '@pmw/validation';
import EstimateStep1Form, {
  type EstimateSpamCheck,
} from '../components/estimate/EstimateStep1Form';
import EstimatePhotosStep from '../components/estimate/EstimatePhotosStep';
import EstimateReviewStep, {
  type EstimateReviewSection,
} from '../components/estimate/EstimateReviewStep';
import { Button, ConfirmationDialog, Modal } from '../components/ui';
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
  const { photos, addPhotos, removePhoto, uploadPhotos } = useEstimatePhotos();
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const { blocker } = useEstimateLeaveGuard(hasDetails || photos.length > 0);
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

  return (
    <main className="flex-1 bg-neutral-50">
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
              Tell us about the item and how we can reach you. Photos are optional and can be added
              on the next step.
            </p>
            <div className="mt-6 md:mt-8">
              <EstimateStep1Form
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
      <Modal
        isOpen={confirmationOpen}
        onClose={() => setConfirmationOpen(false)}
        title="Submit estimate request?"
      >
        <div className="flex flex-col gap-6">
          <p className="type-body text-dark-brown">
            Are you sure you want to send your estimate request?
          </p>
          <p role="status" className="type-body text-neutral-600">
            Submitting requests is not available yet. Your estimate request has not been submitted.
          </p>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setConfirmationOpen(false)}>
              Cancel
            </Button>
            <Button disabled>Submit request</Button>
          </div>
        </div>
      </Modal>
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
