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
import { routes } from '../config/site';

type Props = {
  loadTestimonials?: typeof getPublicTestimonials;
  sendTestimonial?: typeof submitTestimonial;
};

const sectionTitle = 'type-h3 xl:type-h2';

export default function TestimonialsPage({
  loadTestimonials = getPublicTestimonials,
  sendTestimonial = submitTestimonial,
}: Props) {
  const [result, setResult] = useState<
    { request: number; testimonials: PublicTestimonial[] } | { request: number; error: true } | null
  >(null);
  const [reloadToken, setReloadToken] = useState(0);
  const loading = result?.request !== reloadToken;
  const loadError = result?.request === reloadToken && 'error' in result;
  const items =
    result?.request === reloadToken && 'testimonials' in result ? result.testimonials : [];

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
    <main className="mx-auto flex w-full max-w-360 flex-col gap-10 p-4 xl:px-10 xl:py-8">
      <header className="flex flex-col gap-4 rounded-3xl bg-neutral-50 px-4 py-10 xl:rounded-4xl xl:px-28 xl:py-16">
        <p className="type-overline text-walnut">Kind words from our customers</p>
        <h1 className="type-h2 xl:type-h1">Testimonials</h1>
        <p className="type-body-lg max-w-180 text-neutral-800">
          Read what customers have shared about their furniture repair and restoration.
        </p>
      </header>

      <section aria-labelledby="published-title" className="flex flex-col gap-6 px-2">
        <h2 id="published-title" className={sectionTitle}>
          Customer stories
        </h2>
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
          <ul className="grid list-none grid-cols-1 gap-5 p-0 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex min-w-0 flex-col gap-4 rounded-2xl bg-neutral-50 p-6 [overflow-wrap:anywhere]"
              >
                <blockquote className="type-body-lg text-dark-brown">“{item.body}”</blockquote>
                <p className="type-label text-dark-brown">{item.name}</p>
                {item.city || item.service ? (
                  <p className="type-body-sm text-neutral-700">
                    {[item.city, item.service].filter(Boolean).join(' · ')}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <TestimonialForm sendTestimonial={sendTestimonial} />
    </main>
  );
}

function TestimonialForm({ sendTestimonial }: { sendTestimonial: Props['sendTestimonial'] }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [body, setBody] = useState('');
  const [canPublish, setCanPublish] = useState(false);
  const [photoContact, setPhotoContact] = useState(false);
  const [errors, setErrors] = useState<TestimonialFieldErrors>({});
  const [state, setState] = useState<'idle' | 'sending' | 'success' | 'failed'>('idle');
  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (state === 'success') successRef.current?.focus();
  }, [state]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === 'sending' || state === 'success') return;
    const parsed = testimonialSubmissionSchema.safeParse({
      name,
      email,
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
    setState('sending');
    try {
      await sendTestimonial!(parsed.data);
      setState('success');
    } catch (error) {
      if (error instanceof TestimonialValidationError) setErrors(error.fieldErrors);
      setState('failed');
    }
  }

  return (
    <section
      aria-labelledby="submit-title"
      className="rounded-3xl bg-neutral-100 px-4 py-10 xl:rounded-4xl xl:px-16 xl:py-16"
    >
      {state === 'success' ? (
        <div className="flex flex-col gap-5">
          <h2 id="submit-title" ref={successRef} tabIndex={-1} className={sectionTitle}>
            Thank you for sharing
          </h2>
          <SuccessBanner message="Your testimonial was received and is waiting for review. It will not appear publicly unless it is approved." />
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setName('');
              setEmail('');
              setBody('');
              setCanPublish(false);
              setPhotoContact(false);
              setState('idle');
            }}
          >
            Submit another testimonial
          </Button>
        </div>
      ) : (
        <>
          <h2 id="submit-title" className={sectionTitle}>
            Share your experience
          </h2>
          <p className="type-body-lg mt-3 max-w-180 text-neutral-800">
            Your testimonial will be reviewed before it is published.
          </p>
          <form
            ref={formRef}
            noValidate
            onSubmit={handleSubmit}
            aria-busy={state === 'sending'}
            className="mt-6 max-w-180"
          >
            {state === 'failed' ? (
              <div className="mb-5">
                <ErrorBanner message="Your testimonial could not be submitted. Your answers are saved here; please try again." />
              </div>
            ) : null}
            <fieldset disabled={state === 'sending'} className="flex min-w-0 flex-col gap-5">
              <Input
                id="testimonial-name"
                name="name"
                label="Your name"
                autoComplete="name"
                required
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
                error={errors.name}
              />
              <Input
                id="testimonial-email"
                name="email"
                type="email"
                label="Email address"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                error={errors.email}
                hint="Your email will not appear on the public page."
              />
              <div>
                <Textarea
                  id="testimonial-body"
                  name="body"
                  label="Your testimonial"
                  required
                  maxLength={TESTIMONIAL_BODY_LIMIT}
                  value={body}
                  onChange={(event) => setBody(event.target.value.slice(0, TESTIMONIAL_BODY_LIMIT))}
                  error={errors.body}
                  aria-describedby="testimonial-count"
                />
                <p id="testimonial-count" className="type-body-sm mt-2 text-neutral-700">
                  {body.length} / {TESTIMONIAL_BODY_LIMIT} characters
                </p>
              </div>
              <div className="flex flex-col gap-4">
                <div>
                  <Checkbox
                    name="can_publish"
                    required
                    checked={canPublish}
                    aria-invalid={errors.can_publish ? true : undefined}
                    aria-describedby={errors.can_publish ? 'testimonial-consent-error' : undefined}
                    onChange={(event) => setCanPublish(event.target.checked)}
                    label={
                      <>
                        I give permission for my testimonial to be published.{' '}
                        <span aria-hidden="true">(required)</span>
                      </>
                    }
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
                  label="You may contact me about a photo to go with my testimonial (optional)."
                />
              </div>
              <Button type="submit" disabled={state === 'sending'} className="w-full sm:w-fit">
                {state === 'sending' ? 'Sending…' : 'Submit testimonial'}
              </Button>
            </fieldset>
            <p role="status" aria-live="polite" className="sr-only">
              {state === 'sending' ? 'Sending your testimonial.' : ''}
            </p>
          </form>
        </>
      )}
      <a
        href={routes.privacy}
        className="type-body-sm mt-5 inline-block rounded-sm text-dark-brown underline focus-visible:outline-2 focus-visible:outline-amber"
      >
        Privacy information
      </a>
    </section>
  );
}
