import { useEffect, useId, useRef, useState } from 'react';
import { Button, ErrorBanner } from '../ui';
import type { EstimatePhoto, PreparedEstimatePhoto } from '../../lib/estimatePhotos';

interface EstimatePhotosStepProps {
  photos: EstimatePhoto[];
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  onBack: () => void;
  onContinue: (photos: PreparedEstimatePhoto[]) => void | Promise<void>;
}

function PhotoPreview({ file }: { file: File }) {
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    if (imageRef.current) imageRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <img
      ref={imageRef}
      alt={`Preview of ${file.name}`}
      className="h-40 w-full rounded-sm bg-neutral-100 object-contain"
    />
  );
}

export default function EstimatePhotosStep({
  photos,
  onAdd,
  onRemove,
  onBack,
  onContinue,
}: EstimatePhotosStepProps) {
  const id = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const processing = photos.some((photo) => photo.status === 'processing');
  const invalid = photos.some((photo) => photo.status === 'error');

  async function continueToNextStep() {
    if (inFlight.current || processing || invalid) return;
    inFlight.current = true;
    setPending(true);
    setError('');
    try {
      const ready = photos.filter((photo) => photo.status === 'ready');
      await onContinue(
        ready.map(({ id, original, file, uploaded }) => ({
          id,
          original,
          file,
          ...(uploaded ? { uploaded } : {}),
        })),
      );
    } catch {
      if (mounted.current)
        setError(
          'We could not continue. Your photos are still here. Retry Next or remove photos with upload errors.',
        );
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  }

  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="mx-auto w-full max-w-190 rounded-lg border border-neutral-300 bg-white p-4 sm:p-8"
    >
      <h2 id={`${id}-heading`} className="type-h2">
        Add photos of your furniture
      </h2>
      <p className="type-body mt-3">
        Photos help us understand the repair. No photos? That’s okay.
      </p>
      <p id={`${id}-help`} className="type-body-sm mt-2 text-neutral-600">
        Choose JPG or PNG photos, up to 10 MB each. Large photos are reduced to about 1 MB on your
        device. Next uploads your selected photos privately before continuing.
      </p>
      <label htmlFor={`${id}-files`} className="type-label mt-6 block">
        Choose photos
      </label>
      <input
        id={`${id}-files`}
        type="file"
        accept="image/jpeg,image/png,.jpg,.jpeg,.png"
        multiple
        disabled={pending}
        aria-describedby={`${id}-help`}
        className="type-body mt-2 block min-h-11 w-full min-w-0 rounded-sm border border-neutral-300 p-2 focus-visible:outline-2 focus-visible:outline-amber"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = '';
          setError('');
          onAdd(files);
        }}
      />
      {photos.length === 0 && (
        <p className="type-body mt-6 text-neutral-600">
          No photos selected. You can continue without any.
        </p>
      )}
      <ul aria-label="Selected photos" className="mt-6 grid gap-4 sm:grid-cols-2">
        {photos.map((photo) => (
          <li key={photo.id} className="min-w-0 rounded-lg border border-neutral-300 p-3">
            {photo.status === 'ready' && <PhotoPreview file={photo.file} />}
            <p className="type-label mt-2 break-words">{photo.original.name}</p>
            {photo.status === 'processing' && (
              <p className="type-body-sm" role="status">
                Preparing photo…
              </p>
            )}
            {photo.status === 'ready' && (
              <p className="type-body-sm text-neutral-600">
                {photo.uploaded ? 'Uploaded privately' : 'Ready on this device'} ·{' '}
                {Math.ceil(photo.file.size / 1024)} KB
              </p>
            )}
            {photo.status === 'error' && <ErrorBanner message={photo.error} />}
            {photo.status === 'ready' && photo.uploadError && (
              <ErrorBanner message={photo.uploadError} />
            )}
            <Button
              variant="outline"
              className="mt-3 w-full"
              disabled={pending}
              aria-label={`Remove ${photo.original.name}`}
              onClick={() => {
                setError('');
                onRemove(photo.id);
              }}
            >
              Remove photo
            </Button>
          </li>
        ))}
      </ul>
      <p role="status" className="type-body-sm mt-4 text-neutral-600">
        {pending
          ? 'Uploading photos and continuing. Please wait.'
          : processing
            ? 'Preparing your photos. Please wait or remove a photo.'
            : invalid
              ? 'Remove photos with errors or choose replacements before continuing.'
              : ''}
      </p>
      {error && (
        <div ref={errorRef} tabIndex={-1} className="mt-4">
          <ErrorBanner message={error} />
        </div>
      )}
      <div className="mt-6 flex flex-col-reverse gap-4 sm:flex-row sm:justify-between">
        <Button variant="outline" onClick={onBack} disabled={pending}>
          Back
        </Button>
        <Button
          variant="secondary"
          onClick={() => void continueToNextStep()}
          disabled={pending || processing || invalid}
        >
          {pending ? 'Continuing…' : 'Next'}
        </Button>
      </div>
    </section>
  );
}
