import { useId, type ReactNode, type Ref } from 'react';
import { issueOptions, leadSourceOptions, type EstimateStep1Data } from '@pmw/validation';
import type { PreparedEstimatePhoto } from '../../lib/estimatePhotos';
import { Button } from '../ui';
import EstimatePhotoPreview from './EstimatePhotoPreview';

export type EstimateReviewSection = 'contact' | 'address' | 'repair' | 'photos' | 'source';

interface EstimateReviewStepProps {
  headingRef?: Ref<HTMLHeadingElement>;
  details: EstimateStep1Data;
  photos: PreparedEstimatePhoto[];
  onEdit: (section: EstimateReviewSection) => void;
  /** Opens confirmation; final submission belongs to SSPMW-53/70. */
  onSubmit?: () => void;
}

function ReviewSection({
  title,
  editLabel,
  onEdit,
  children,
}: {
  title: string;
  editLabel: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="rounded-lg border border-neutral-300 bg-white p-4 sm:p-6"
    >
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 id={id} className="type-h3">
          {title}
        </h3>
        <Button variant="outline" aria-label={editLabel} onClick={onEdit}>
          Edit
        </Button>
      </div>
      {children}
    </section>
  );
}

function ReviewField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="type-label text-neutral-600">{label}</dt>
      <dd className="type-body mt-1 whitespace-pre-wrap break-words text-dark-brown">{children}</dd>
    </div>
  );
}

export default function EstimateReviewStep({
  headingRef,
  details,
  photos,
  onEdit,
  onSubmit,
}: EstimateReviewStepProps) {
  return (
    <section aria-labelledby="estimate-review-heading" className="mx-auto max-w-190">
      <h2
        ref={headingRef}
        id="estimate-review-heading"
        tabIndex={-1}
        className="type-h2 scroll-mt-28"
      >
        Review your request
      </h2>
      <p className="type-body-lg mt-3 text-neutral-600">
        Check your details and photos. Use Edit to make changes before submitting.
      </p>
      <div className="mt-6 flex flex-col gap-4">
        <ReviewSection
          title="Contact details"
          editLabel="Edit contact details"
          onEdit={() => onEdit('contact')}
        >
          <dl className="grid gap-4 sm:grid-cols-2">
            <ReviewField label="First name">{details.first_name}</ReviewField>
            <ReviewField label="Last name">{details.last_name}</ReviewField>
            <ReviewField label="Email address">{details.email}</ReviewField>
            <ReviewField label="Phone number">{details.phone}</ReviewField>
            <ReviewField label="Contact me by text message">
              {details.text_ok ? 'Yes' : 'No'}
            </ReviewField>
          </dl>
        </ReviewSection>
        <ReviewSection
          title="Service address"
          editLabel="Edit service address"
          onEdit={() => onEdit('address')}
        >
          <dl className="grid gap-4 sm:grid-cols-2">
            <ReviewField label="Address">{details.address}</ReviewField>
            <ReviewField label="City">{details.city}</ReviewField>
          </dl>
        </ReviewSection>
        <ReviewSection
          title="Repair details"
          editLabel="Edit repair details"
          onEdit={() => onEdit('repair')}
        >
          <dl className="grid gap-4">
            <ReviewField label="Item">{details.item}</ReviewField>
            <ReviewField label="What happened?">
              {issueOptions.find(({ value }) => value === details.issue_type)?.label}
            </ReviewField>
            <ReviewField label="Describe the problem">{details.description}</ReviewField>
          </dl>
        </ReviewSection>
        <ReviewSection
          title="How did you hear about us?"
          editLabel="Edit lead source"
          onEdit={() => onEdit('source')}
        >
          <p className="type-body">
            {leadSourceOptions.find((option) => option.value === details.lead_source)?.label}
          </p>
        </ReviewSection>
        <ReviewSection title="Photos" editLabel="Edit photos" onEdit={() => onEdit('photos')}>
          {photos.length === 0 ? (
            <p className="type-body text-neutral-600">No photos selected.</p>
          ) : (
            <ul aria-label="Request photos" className="grid gap-4 sm:grid-cols-2">
              {photos.map((photo) => (
                <li key={photo.id} className="min-w-0">
                  <EstimatePhotoPreview file={photo.file} />
                  <p className="type-body-sm mt-2 break-words">{photo.original.name}</p>
                </li>
              ))}
            </ul>
          )}
        </ReviewSection>
      </div>
      {!onSubmit && (
        <p id="estimate-submit-unavailable" className="type-body mt-6 text-neutral-600">
          Submitting requests is not available yet. Your estimate request has not been submitted.
        </p>
      )}
      <div className="mt-6 flex flex-col-reverse gap-4 sm:flex-row sm:justify-between">
        <Button variant="outline" onClick={() => onEdit('photos')}>
          Back to photos
        </Button>
        <Button
          variant="secondary"
          disabled={!onSubmit}
          aria-describedby={!onSubmit ? 'estimate-submit-unavailable' : undefined}
          onClick={onSubmit}
        >
          Submit request
        </Button>
      </div>
    </section>
  );
}
