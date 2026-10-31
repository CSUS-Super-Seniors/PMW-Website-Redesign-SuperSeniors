import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import {
  estimateStep1Schema,
  issueOptions,
  mapEstimateStep1Errors,
  type EstimateStep1Data,
  type EstimateStep1Errors,
  type EstimateStep1FieldErrors,
  type EstimateStep1Input,
} from '@pmw/validation';
import { Button, Checkbox, ErrorBanner, InlineFieldError, Input, Select, Textarea } from '../ui';
import { routes } from '../../config/site';
import { validateEstimateStep1 } from '../../lib/validateEstimateStep1';

export type EstimateStep1Continuation = (details: EstimateStep1Data) => void | Promise<void>;

export interface EstimateStep1FormProps {
  onContinue: EstimateStep1Continuation;
  initialValues?: EstimateStep1Input;
  onEdit?: () => void;
}

// The empty select placeholder is a draft value, never a validated issue value.
type Draft = Omit<EstimateStep1Input, 'issue_type' | 'text_ok'> & {
  issue_type: string;
  text_ok: boolean;
};

const fieldOrder = [
  'first_name',
  'last_name',
  'email',
  'phone',
  'text_ok',
  'address',
  'item',
  'issue_type',
  'description',
] as const satisfies readonly (keyof EstimateStep1Input)[];

export default function EstimateStep1Form({
  onContinue,
  initialValues,
  onEdit,
}: EstimateStep1FormProps) {
  const [draft, setDraft] = useState<Draft>(() => ({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    address: '',
    item: '',
    issue_type: '',
    description: '',
    ...initialValues,
    text_ok: initialValues?.text_ok ?? false,
  }));
  const [fieldErrors, setFieldErrors] = useState<EstimateStep1FieldErrors>({});
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [attempted, setAttempted] = useState(false);
  const [pending, setPending] = useState(false);
  const [focusRequest, setFocusRequest] = useState<{ field?: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  useEffect(() => {
    if (pending || !focusRequest) return;
    const target = focusRequest.field
      ? formRef.current?.elements.namedItem(focusRequest.field)
      : errorRef.current;
    if (target instanceof HTMLElement) target.focus();
  }, [focusRequest, pending]);

  function updateField<K extends keyof Draft>(field: K, value: Draft[K]) {
    const next = { ...draft, [field]: value };
    setDraft(next);
    setFormErrors([]);
    onEdit?.();
    if (!attempted) return;

    const result = estimateStep1Schema.safeParse(next);
    const nextErrors = result.success ? {} : mapEstimateStep1Errors(result.error).fieldErrors;
    setFieldErrors((previous) => ({ ...previous, [field]: nextErrors[field] }));
  }

  function showErrors(errors: EstimateStep1Errors) {
    setFieldErrors(errors.fieldErrors);
    // City has no control in Step 1, so a server error for it belongs in the summary.
    setFormErrors([
      ...errors.formErrors,
      ...(errors.fieldErrors.city ? [errors.fieldErrors.city] : []),
    ]);
    setFocusRequest({ field: fieldOrder.find((field) => errors.fieldErrors[field]) });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    setAttempted(true);
    setFocusRequest(null);
    setFormErrors([]);
    onEdit?.();

    const local = estimateStep1Schema.safeParse(draft);
    if (!local.success) {
      showErrors(mapEstimateStep1Errors(local.error));
      return;
    }

    setFieldErrors({});
    inFlight.current = true;
    setPending(true);
    const controller = new AbortController();
    requestRef.current = controller;

    try {
      let result;
      try {
        result = await validateEstimateStep1(local.data, controller.signal);
      } catch {
        if (!controller.signal.aborted) {
          showErrors({
            fieldErrors: {},
            formErrors: ['We could not check your details. Check your connection and try again.'],
          });
        }
        return;
      }
      if (controller.signal.aborted) return;
      if (!result.valid) {
        showErrors(result);
        return;
      }

      try {
        await onContinue(local.data);
      } catch {
        if (!controller.signal.aborted) {
          showErrors({
            fieldErrors: {},
            formErrors: [
              'We could not continue to photos. Your request has not been sent. Please try again.',
            ],
          });
        }
      }
    } finally {
      inFlight.current = false;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return (
    <section
      aria-labelledby="estimate-details-heading"
      className="mx-auto w-full max-w-190 rounded-xl border border-neutral-300 bg-white p-4 sm:p-6 md:p-8"
    >
      <h2 id="estimate-details-heading" className="type-h3">
        Your details
      </h2>
      <p className="type-body-sm mt-4 text-neutral-600">
        We only use this information to respond to your estimate request.
      </p>
      <p id="estimate-required" className="type-body-sm mt-2 text-neutral-600">
        All fields are required except text message permission.
      </p>

      <form
        ref={formRef}
        noValidate
        onSubmit={handleSubmit}
        aria-describedby="estimate-required"
        aria-busy={pending}
        className="mt-6"
      >
        {formErrors.length > 0 && (
          <div
            ref={errorRef}
            tabIndex={-1}
            className="mb-6 flex flex-col gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-amber"
          >
            {formErrors.map((message, index) => (
              <ErrorBanner key={index} message={message} />
            ))}
          </div>
        )}
        <fieldset disabled={pending} className="grid min-w-0 grid-cols-1 gap-6 sm:grid-cols-2">
          <legend className="sr-only">Contact and repair details</legend>
          <Input
            label="First name"
            name="first_name"
            value={draft.first_name}
            onChange={(event) => updateField('first_name', event.target.value)}
            autoComplete="given-name"
            placeholder="Ex: Margaret"
            required
            maxLength={estimateStep1Schema.shape.first_name.maxLength ?? undefined}
            error={fieldErrors.first_name}
          />
          <Input
            label="Last name"
            name="last_name"
            value={draft.last_name}
            onChange={(event) => updateField('last_name', event.target.value)}
            autoComplete="family-name"
            placeholder="Ex: Lewis"
            required
            maxLength={estimateStep1Schema.shape.last_name.maxLength ?? undefined}
            error={fieldErrors.last_name}
          />
          <div>
            <Input
              label="Email address"
              name="email"
              type="email"
              value={draft.email}
              onChange={(event) => updateField('email', event.target.value)}
              autoComplete="email"
              placeholder="margaret@example.com"
              required
              maxLength={estimateStep1Schema.shape.email.maxLength ?? undefined}
              error={fieldErrors.email}
              aria-describedby="estimate-email-hint"
            />
            <p id="estimate-email-hint" className="type-body-sm mt-1 text-neutral-600">
              We’ll only use this to reply to your request.
            </p>
          </div>
          <Input
            label="Phone number"
            name="phone"
            type="tel"
            inputMode="tel"
            value={draft.phone}
            onChange={(event) => updateField('phone', event.target.value)}
            autoComplete="tel"
            placeholder="(916) 555-0142"
            required
            maxLength={estimateStep1Schema.shape.phone.maxLength ?? undefined}
            error={fieldErrors.phone}
          />
          <div className="flex min-h-11 flex-col justify-center gap-2 sm:col-span-2">
            <Checkbox
              label="Contact me by text message"
              name="text_ok"
              checked={draft.text_ok}
              onChange={(event) => updateField('text_ok', event.target.checked)}
              aria-invalid={fieldErrors.text_ok ? true : undefined}
              aria-describedby={fieldErrors.text_ok ? 'estimate-text-ok-error' : undefined}
            />
            <InlineFieldError id="estimate-text-ok-error" message={fieldErrors.text_ok} />
          </div>
          <Input
            label="Service address"
            name="address"
            value={draft.address}
            onChange={(event) => updateField('address', event.target.value)}
            autoComplete="street-address"
            placeholder="4821 Fair Oaks Blvd"
            required
            maxLength={estimateStep1Schema.shape.address.maxLength ?? undefined}
            error={fieldErrors.address}
          />
          <Input
            label="Item"
            name="item"
            value={draft.item}
            onChange={(event) => updateField('item', event.target.value)}
            placeholder="Dining chair"
            required
            maxLength={estimateStep1Schema.shape.item.maxLength ?? undefined}
            error={fieldErrors.item}
          />
          <Select
            label="What happened?"
            name="issue_type"
            value={draft.issue_type}
            onChange={(event) => updateField('issue_type', event.target.value)}
            required
            error={fieldErrors.issue_type}
          >
            <option value="">Select a problem</option>
            {issueOptions.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <div className="sm:col-span-2">
            <Textarea
              label="Describe the problem"
              name="description"
              value={draft.description}
              onChange={(event) => updateField('description', event.target.value)}
              placeholder="Tell us what needs repair."
              rows={4}
              required
              maxLength={estimateStep1Schema.shape.description.maxLength ?? undefined}
              error={fieldErrors.description}
            />
          </div>
        </fieldset>
        <p className="type-body-sm mt-6 text-neutral-600">
          We’ll confirm whether the address is within our service area before you submit.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link
            to={routes.home}
            className="type-button inline-flex min-h-11 items-center rounded-sm text-walnut underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
          >
            Cancel
          </Link>
          <Button type="submit" variant="secondary" disabled={pending} className="w-full sm:w-auto">
            {pending ? 'Checking details…' : 'Continue to photos'}
          </Button>
        </div>
        <p role="status" className="sr-only">
          {pending ? 'Checking your details. Please wait.' : ''}
        </p>
      </form>
    </section>
  );
}
