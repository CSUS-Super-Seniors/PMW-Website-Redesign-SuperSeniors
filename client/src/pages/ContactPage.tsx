import { useRef, useState, type FormEvent } from 'react';
import { sendContactMessage, type ContactMessage } from '../api/contact';
import { Button, ErrorBanner, Input, Textarea } from '../components/ui';
import { business } from '../config/site';

type ContactPageProps = {
  onSend?: (message: ContactMessage) => Promise<void>;
};
type Fields = { name: string; contact: string; message: string };
type FieldErrors = Partial<Record<keyof Fields, string>>;
type SendState = 'idle' | 'sending' | 'sent' | 'failed';

const emptyFields: Fields = { name: '', contact: '', message: '' };
const messageLimit = 500;
const callLinkClass =
  'rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber';

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isPhone(value: string) {
  // Accept US numbers with common formatting and an optional +1 country code.
  if (!/^\+?[\d\s().-]+$/.test(value)) return false;
  return /^(?:1)?[2-9]\d{2}[2-9]\d{6}$/.test(value.replace(/\D/g, ''));
}

export default function ContactPage({ onSend = sendContactMessage }: ContactPageProps) {
  const [fields, setFields] = useState<Fields>(emptyFields);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [state, setState] = useState<SendState>('idle');
  const pending = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const sending = state === 'sending';

  function updateField(field: keyof Fields, value: string) {
    setFields((previous) => ({ ...previous, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || state === 'sent') return;

    const name = fields.name.trim();
    const contact = fields.contact.trim();
    const message = fields.message.trim();
    const nextErrors: FieldErrors = {};
    if (!name) nextErrors.name = 'Enter your name.';
    if (!contact) nextErrors.contact = 'Enter your phone number or email address.';
    else if (!isEmail(contact) && !isPhone(contact)) {
      nextErrors.contact = 'Enter a valid phone number or email address.';
    }
    if (!message) nextErrors.message = 'Enter your message.';
    else if (fields.message.length > messageLimit) {
      nextErrors.message = 'Keep your message to 500 characters or fewer.';
    }
    setErrors(nextErrors);
    setState('idle');
    const firstInvalidField = (Object.keys(nextErrors) as (keyof Fields)[])[0];
    if (firstInvalidField) {
      formRef.current?.querySelector<HTMLElement>(`[name="${firstInvalidField}"]`)?.focus();
      return;
    }

    pending.current = true;
    setState('sending');
    try {
      await onSend({
        name,
        email: isEmail(contact) ? contact : null,
        phone: isEmail(contact) ? null : contact,
        message,
      });
      setState('sent');
    } catch {
      setState('failed');
    } finally {
      pending.current = false;
    }
  }

  return (
    <main className="mx-auto w-full max-w-360 px-4 pt-4 pb-14 md:px-10 md:pt-8 md:pb-28">
      <section
        aria-labelledby="contact-heading"
        className="rounded-3xl bg-neutral-50 px-4 py-10 md:rounded-4xl md:px-28 md:py-20"
      >
        <p className="type-label text-walnut uppercase">Contact</p>
        <h1 id="contact-heading" className="type-h2 mt-6 md:type-h1">
          Get in touch
        </h1>
        <p className="type-body-lg mt-6 text-neutral-800">
          Have a question about a repair or a project? Send us a message or give us a call.
        </p>
      </section>

      <div className="mt-6 grid items-stretch gap-6 md:mt-10 md:gap-10 lg:grid-cols-2">
        <section
          aria-label="Call, location, and hours"
          className="flex min-w-0 flex-col gap-6 rounded-3xl bg-neutral-100 p-6 md:gap-8 md:rounded-4xl md:p-14"
        >
          <div className="rounded-xl bg-white p-7">
            <h2 className="type-body font-semibold text-walnut">Call us</h2>
            <a
              href={business.phoneHref}
              className={`type-h2 mt-2 block w-fit max-w-full md:type-h1 ${callLinkClass}`}
            >
              {business.phoneDisplay}
            </a>
            <a
              href={business.phoneHref}
              className={`type-button mt-2 inline-flex min-h-11 w-full items-center justify-center bg-dark-brown px-5 py-3 text-white hover:bg-neutral-800 md:w-fit ${callLinkClass}`}
            >
              Tap to call
            </a>
            <p className="type-body-sm mt-3 text-neutral-600">
              On a phone, tap the number or the button to call right away.
            </p>
          </div>
          <div className="rounded-xl bg-white p-7">
            <h2 className="type-body font-semibold text-walnut">Service area</h2>
            <p className="type-body-lg mt-2">{business.location}</p>
          </div>
          <div className="rounded-xl bg-white p-7">
            <h2 className="type-body font-semibold text-walnut">Hours</h2>
            <p className="type-body-lg mt-2">Monday to Saturday, 8 am to 5 pm</p>
          </div>
        </section>

        <section
          aria-labelledby="message-heading"
          className="min-w-0 rounded-3xl border border-neutral-300 p-6 md:rounded-4xl md:p-14"
        >
          <h2 id="message-heading" className="type-h2">
            Send us a message
          </h2>
          <div role="status" aria-live="polite" aria-atomic="true">
            {state === 'sent' && (
              <div className="type-body mt-6 rounded-lg border border-success bg-success-light p-4">
                <p className="font-semibold">Message sent.</p>
                <p className="mt-2">
                  Thank you for getting in touch. We will reply using the contact details you
                  provided.
                </p>
              </div>
            )}
          </div>
          {state === 'sent' ? (
            <Button
              className="mt-6 w-full md:w-fit"
              onClick={() => {
                setFields(emptyFields);
                setErrors({});
                setState('idle');
              }}
            >
              Send another message
            </Button>
          ) : (
            <form
              ref={formRef}
              noValidate
              onSubmit={handleSubmit}
              aria-busy={sending}
              className="mt-6"
            >
              {state === 'failed' && (
                <ErrorBanner
                  className="mb-6"
                  message="Your message could not be sent. Please try again, or call us using the number on this page."
                />
              )}
              <fieldset disabled={sending} className="min-w-0 space-y-6">
                <div>
                  <Input
                    id="contact-name"
                    name="name"
                    label="Your name"
                    placeholder="Your full name"
                    autoComplete="name"
                    required
                    value={fields.name}
                    onChange={(event) => updateField('name', event.target.value)}
                    error={errors.name}
                    aria-describedby="contact-name-hint"
                  />
                  <p id="contact-name-hint" className="type-body-sm mt-2 text-neutral-600">
                    The name you would like us to use.
                  </p>
                </div>
                <div>
                  <Input
                    id="contact-reply"
                    name="contact"
                    label="Phone number or email"
                    placeholder="Phone number or email address"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                    value={fields.contact}
                    onChange={(event) => updateField('contact', event.target.value)}
                    error={errors.contact}
                    aria-describedby="contact-reply-hint"
                  />
                  <p id="contact-reply-hint" className="type-body-sm mt-2 text-neutral-600">
                    We will only use this to reply to your message.
                  </p>
                </div>
                <div>
                  <Textarea
                    id="contact-message"
                    name="message"
                    label="Your message"
                    placeholder="Tell us how we can help."
                    className="min-h-30 resize-y"
                    maxLength={messageLimit}
                    required
                    value={fields.message}
                    onChange={(event) => updateField('message', event.target.value)}
                    error={errors.message}
                    aria-describedby="contact-message-count"
                  />
                  <p id="contact-message-count" className="type-body-sm mt-2 text-neutral-600">
                    {fields.message.length} / {messageLimit} characters
                  </p>
                </div>
                <Button type="submit" disabled={sending} className="w-full md:w-fit">
                  {sending ? 'Sending…' : 'Send message'}
                </Button>
              </fieldset>
              <p role="status" aria-live="polite" className="sr-only">
                {sending ? 'Sending your message.' : ''}
              </p>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
