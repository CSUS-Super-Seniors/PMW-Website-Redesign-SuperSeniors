import { useEffect, useRef, useState } from 'react';
import type { EstimateStep1Data } from '@pmw/validation';
import EstimateStep1Form from '../components/estimate/EstimateStep1Form';
import EstimatePhotosStep from '../components/estimate/EstimatePhotosStep';
import { Button } from '../components/ui';
import { useEstimatePhotos } from '../lib/useEstimatePhotos';
import type { EstimatePhotoHandoff } from '../lib/estimatePhotos';

export default function EstimateRequestPage() {
  const [validatedDetails, setValidatedDetails] = useState<EstimateStep1Data | null>(null);
  const [step, setStep] = useState<'details' | 'photos' | 'handoff'>('details');
  const [handoff, setHandoff] = useState<EstimatePhotoHandoff | null>(null);
  const { photos, addPhotos, removePhoto, uploadPhotos } = useEstimatePhotos();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  function continueFromDetails(details: EstimateStep1Data) {
    setValidatedDetails(details);
    // SSPMW-24 will insert service-area approval here; field validation still runs first.
    setStep('photos');
  }

  return (
    <main className="flex-1 bg-neutral-50">
      <div className="mx-auto w-full max-w-content px-4 py-8 md:px-8 md:py-12">
        <p className="type-overline text-amber-dark">
          {step === 'details'
            ? 'Step 1 of 4'
            : step === 'photos'
              ? 'Step 2 of 4'
              : 'Photo step complete'}
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
                initialValues={validatedDetails ?? undefined}
                onContinue={continueFromDetails}
              />
            </div>
            <p className="type-body-sm mt-6 text-neutral-600">
              Next: add optional photos so we can better understand the repair.
            </p>
          </>
        )}
        {step === 'photos' && (
          <div className="mt-6">
            <EstimatePhotosStep
              photos={photos}
              onAdd={addPhotos}
              onRemove={removePhoto}
              onBack={() => setStep('details')}
              onContinue={async () => {
                setHandoff(await uploadPhotos());
                setStep('handoff');
              }}
            />
          </div>
        )}
        {step === 'handoff' && (
          <section className="mx-auto mt-6 max-w-190 rounded-lg border border-neutral-300 bg-white p-4 sm:p-8">
            <h2 className="type-h2">Your photos are ready</h2>
            <p role="status" className="type-body mt-4">
              {handoff?.photos.length ?? 0} photo(s) uploaded privately. Review and submission are
              not available yet. Your estimate request has not been submitted.
            </p>
            <Button variant="outline" className="mt-6" onClick={() => setStep('photos')}>
              Back to photos
            </Button>
          </section>
        )}
      </div>
    </main>
  );
}
