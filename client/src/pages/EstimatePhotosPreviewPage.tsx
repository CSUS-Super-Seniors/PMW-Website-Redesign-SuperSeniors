import { useState } from 'react';
import EstimatePhotosStep from '../components/estimate/EstimatePhotosStep';
import { Button } from '../components/ui';
import { useEstimatePhotos } from '../lib/useEstimatePhotos';

/** Development demonstration only; never a replacement for the service-area gate. */
export default function EstimatePhotosPreviewPage() {
  const { photos, addPhotos, removePhoto, uploadPhotos } = useEstimatePhotos();
  const [step, setStep] = useState<'details' | 'photos' | 'handoff'>('photos');
  const [item, setItem] = useState('Dining chair');
  const [count, setCount] = useState(0);

  return (
    <main className="mx-auto w-full max-w-content px-4 py-8 md:px-8">
      <h1 className="type-h1">Photo step development preview</h1>
      <p className="type-body my-6 rounded-lg border border-neutral-300 bg-neutral-50 p-4">
        Development preview: Next uploads photos to configured private storage. Use a local/test
        backend only. No inquiry is submitted. This is not the customer flow or service-area
        approval.
      </p>
      {step === 'photos' && (
        <EstimatePhotosStep
          photos={photos}
          onAdd={addPhotos}
          onRemove={removePhoto}
          onBack={() => setStep('details')}
          onContinue={async () => {
            const uploaded = await uploadPhotos();
            setCount(uploaded.photos.length);
            setStep('handoff');
          }}
        />
      )}
      {step === 'details' && (
        <section className="mx-auto max-w-190">
          <h2 className="type-h2">Local navigation demonstration</h2>
          <label htmlFor="preview-item" className="type-label mt-4 block">
            Demonstration item
          </label>
          <input
            id="preview-item"
            value={item}
            onChange={(event) => setItem(event.target.value)}
            className="type-body mt-2 block min-h-11 w-full rounded-sm border border-neutral-300 p-2"
          />
          <p className="type-body my-4">
            This field is preview-only, not Step 1 validation or a service-area result.
          </p>
          <Button onClick={() => setStep('photos')}>Return to photos</Button>
        </section>
      )}
      {step === 'handoff' && (
        <section className="mx-auto max-w-190">
          <h2 className="type-h2">Local handoff demonstration</h2>
          <p role="status" className="type-body my-4">
            {count} photo(s) uploaded privately for {item}. No inquiry submission has occurred. The
            real review step is not connected.
          </p>
          <Button onClick={() => setStep('photos')}>Back to photos</Button>
        </section>
      )}
    </main>
  );
}
