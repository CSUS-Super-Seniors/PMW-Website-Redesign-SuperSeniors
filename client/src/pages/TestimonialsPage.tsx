import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  TESTIMONIAL_BODY_LIMIT,
  mapTestimonialErrors,
  testimonialSubmissionSchema,
  type PublicTestimonial,
  type TestimonialFieldErrors,
  type TestimonialSubmission,
} from '@pmw/validation';
import {
  getPublicTestimonials,
  submitTestimonial,
  TestimonialValidationError,
} from '../api/testimonials';
import { Button, Checkbox, ErrorBanner, Input, SuccessBanner, Textarea } from '../components/ui';

type Props = {
  loadTestimonials?: typeof getPublicTestimonials;
  sendTestimonial?: typeof submitTestimonial;
};

const sectionTitle = 'type-h3';

export default function TestimonialsPage({
  loadTestimonials = getPublicTestimonials,
  sendTestimonial = submitTestimonial,
}: Props) {
  const [result, setResult] = useState<
    { request: number; testimonials: PublicTestimonial[] } | { request: number; error: true } | null
  >(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [successCount, setSuccessCount] = useState(0);
  const successRef = useRef<HTMLDivElement>(null);
  const loading = result?.request !== reloadToken;
  const loadError = result?.request === reloadToken && 'error' in result;
  const items =
    result?.request === reloadToken && 'testimonials' in result ? result.testimonials : [];

  useEffect(() => {
    if (successCount > 0) {
      successRef.current?.focus();
      successRef.current?.scrollIntoView?.({ block: 'start' });
    }
  }, [successCount]);

  useEffect(() => {
    let active = true;
    void loadTestimonials()
      .then((testimonials) => {
        if (active) setResult({ request: reloadToken, testimonials });
      })
      .catch(() => {
        if (active) setResult({ request: reloadToken, error: true });
      });
    return () => {
      active = false;
    };
  }, [loadTestimonials, reloadToken]);

  return (
    <main className="mx-auto flex w-full max-w-360 flex-col gap-8 px-4 py-6 md:px-10 lg:px-20 lg:py-20">
      {successCount > 0 ? (
        <div key={successCount} ref={successRef} tabIndex={-1} className="scroll-mt-26">
          <SuccessBanner
            title="Thank you. Your testimonial was sent."
            message="We review every submission before it is published."
            onDismiss={() => setSuccessCount(0)}
          />
        </div>
      ) : null}
      <header className="flex flex-col gap-4">
        <p className="type-overline text-walnut">Customer stories</p>
        <h1 className="type-h2 lg:type-h1">Testimonials</h1>
        <p className="type-body text-neutral-600">
          Hear from homeowners, designers, and collectors who trust Peterson Mobile Woodworking for
          furniture repair, refinishing, and restoration.
        </p>
      </header>

      <section aria-labelledby="published-title" className="flex flex-col gap-3">
        <h2 id="published-title" className={sectionTitle}>
          Featured testimonials
        </h2>
        <p className="type-body text-neutral-600">
          Recent stories from customers who gave us permission to share their experience.
        </p>
        {loading ? (
          <p role="status" className="type-body-lg">
            Loading testimonials…
          </p>
        ) : null}
        {loadError ? (
          <div className="flex flex-col items-start gap-4">
            <ErrorBanner message="Testimonials could not be loaded." />
            <Button
              type="button"
              variant="secondary"
              onClick={() => setReloadToken((token) => token + 1)}
            >
              Try again
            </Button>
          </div>
        ) : null}
        {!loading && !loadError && items.length === 0 ? (
          <p className="type-body-lg text-neutral-700">
            No testimonials have been published yet. Please check back soon.
          </p>
        ) : null}
        {!loading && !loadError && items.length > 0 ? (
          <ul className="grid list-none grid-cols-1 gap-6 p-0 md:grid-cols-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex min-w-0 flex-col items-start gap-5 rounded-lg border border-neutral-300 bg-white px-4 py-6 lg:p-6 [overflow-wrap:anywhere]"
              >
                {item.rating != null ? <TestimonialRating rating={item.rating} /> : null}
                <blockquote className="type-body text-dark-brown">“{item.body}”</blockquote>
                <div className="flex flex-col gap-1">
                  <p className="type-label text-dark-brown">{item.name}</p>
                  {item.city || item.service ? (
                    <p className="type-caption text-neutral-600">
                      {[item.city, item.service].filter(Boolean).join(' · ')}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <TestimonialForm
        sendTestimonial={sendTestimonial}
        onSuccess={() => setSuccessCount((count) => count + 1)}
      />
    </main>
  );
}

function TestimonialRating({ rating }: { rating: number }) {
  return (
    <div role="img" aria-label={`${rating} out of 5 stars`} className="flex gap-1 text-amber">
      {Array.from({ length: 5 }, (_, index) => (
        <svg
          key={index}
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-6"
          fill={index < rating ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        >
          <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" />
        </svg>
      ))}
    </div>
  );
}

function TestimonialForm({
  sendTestimonial,
  onSuccess,
}: {
  sendTestimonial: typeof submitTestimonial;
  onSuccess: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [service, setService] = useState('');
  const [body, setBody] = useState('');
  const [canPublish, setCanPublish] = useState(false);
  const [photoContact, setPhotoContact] = useState(false);
  const [errors, setErrors] = useState<TestimonialFieldErrors>({});
  const [state, setState] = useState<'idle' | 'sending' | 'failed'>('idle');
  const formRef = useRef<HTMLFormElement>(null);
  const pending = useRef(false);
  const bodyError =
    body.length > TESTIMONIAL_BODY_LIMIT
      ? 'Testimonial must be 500 characters or fewer.'
      : errors.body;

  function resetForm() {
    setName('');
    setEmail('');
    setCity('');
    setService('');
    setBody('');
    setCanPublish(false);
    setPhotoContact(false);
    setErrors({});
    setState('idle');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const parsed = testimonialSubmissionSchema.safeParse({
      name,
      email,
      city,
      service,
      body,
      can_publish: canPublish,
      photo_contact_ok: photoContact,
    });
    if (!parsed.success) {
      const next = mapTestimonialErrors(parsed.error).fieldErrors;
      setErrors(next);
      setState('idle');
      const first = (Object.keys(next) as (keyof TestimonialSubmission)[])[0];
      if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setErrors({});
    pending.current = true;
    setState('sending');
    try {
      await sendTestimonial(parsed.data);
      resetForm();
      onSuccess();
    } catch (error) {
      if (error instanceof TestimonialValidationError) setErrors(error.fieldErrors);
      setState('failed');
    } finally {
      pending.current = false;
    }
  }

  return (
    <section aria-labelledby="submit-title" className="flex flex-col gap-3">
      <h2 id="submit-title" className={sectionTitle}>
        Share your story
      </h2>
      <p className="type-body text-neutral-600">
        Tell us about your experience with Peterson Mobile Woodworking. We review every submission
        before publishing.
      </p>
      <form
        ref={formRef}
        noValidate
        onSubmit={handleSubmit}
        aria-busy={state === 'sending'}
        className="rounded-lg border border-neutral-300 bg-white px-4 py-8 lg:p-8"
      >
        {state === 'failed' ? (
          <div className="mb-5">
            <ErrorBanner message="Your testimonial could not be submitted. Your answers are saved here; please try again." />
          </div>
        ) : null}
        <fieldset
          disabled={state === 'sending'}
          className="grid min-w-0 grid-cols-1 gap-x-6 gap-y-6 md:grid-cols-2"
        >
          <Input
            id="testimonial-name"
            name="name"
            label="Full name"
            placeholder="Jane Doe"
            autoComplete="name"
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={errors.name}
            className="text-body leading-6"
          />
          <Input
            id="testimonial-email"
            name="email"
            type="email"
            label="Email address"
            placeholder="jane@example.com"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={errors.email}
            className="text-body leading-6"
            hint="We’ll only use this to request a photo or confirm details."
          />
          <Input
            id="testimonial-city"
            name="city"
            label="City (optional)"
            placeholder="Sacramento"
            autoComplete="address-level2"
            maxLength={100}
            value={city}
            onChange={(event) => setCity(event.target.value)}
            error={errors.city}
            className="text-body leading-6"
          />
          <Input
            id="testimonial-service"
            name="service"
            label="Service (optional)"
            placeholder="Refinishing"
            maxLength={200}
            value={service}
            onChange={(event) => setService(event.target.value)}
            error={errors.service}
            className="text-body leading-6"
          />
          <div className="md:col-span-2">
            <Textarea
              id="testimonial-body"
              name="body"
              label="Your testimonial"
              placeholder="Tell us what you liked most about the work, the communication, and the final result."
              required
              value={body}
              onChange={(event) => {
                setBody(event.target.value);
                setErrors((previous) => ({ ...previous, body: undefined }));
              }}
              error={bodyError}
              aria-describedby="testimonial-count"
              className="min-h-30 text-body leading-6"
            />
            <p id="testimonial-count" className="type-body-sm mt-1 text-neutral-600">
              {body.length} / {TESTIMONIAL_BODY_LIMIT} characters
            </p>
          </div>
          <div className="flex flex-col gap-5 md:col-span-2 lg:gap-1">
            <div>
              <Checkbox
                name="can_publish"
                required
                checked={canPublish}
                aria-invalid={errors.can_publish ? true : undefined}
                aria-describedby={errors.can_publish ? 'testimonial-consent-error' : undefined}
                onChange={(event) => setCanPublish(event.target.checked)}
                label={<>You may publish my testimonial.</>}
              />
              {errors.can_publish ? (
                <p
                  id="testimonial-consent-error"
                  role="alert"
                  className="type-body-sm mt-2 text-error"
                >
                  {errors.can_publish}
                </p>
              ) : null}
            </div>
            <Checkbox
              name="photo_contact_ok"
              checked={photoContact}
              onChange={(event) => setPhotoContact(event.target.checked)}
              label="Contact me about adding a photo."
            />
          </div>
        </fieldset>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={state === 'sending'}
            onClick={resetForm}
          >
            Cancel
          </Button>
          <Button type="submit" variant="secondary" disabled={state === 'sending'}>
            {state === 'sending' ? 'Sending…' : 'Submit testimonial'}
          </Button>
        </div>
        <p role="status" aria-live="polite" className="sr-only">
          {state === 'sending' ? 'Sending your testimonial.' : ''}
        </p>
      </form>
    </section>
  );
}
