import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  CITY_MAX_LENGTH,
  CUSTOMER_SAVE_FAILED_MESSAGE,
  leadSourceOptions,
  mapNewCustomerErrors,
  newCustomerFields,
  newCustomerSchema,
  preferredContactOptions,
  type NewCustomerErrors,
  type NewCustomerField,
  type NewCustomerFieldErrors,
} from '@pmw/validation';
import { createCustomer } from '../api/createCustomer';
import { useAuth } from '../auth/AuthContext';
import { Button, Checkbox, ErrorBanner, InlineFieldError, Input, Select } from '../components/ui';
import { CUSTOMERS_PATH, type CustomerAddedState } from '../components/customers/customerRoutes';

// Every field is text while it is being typed. Blank selects and dates stay "" and
// the shared schema turns them into "not chosen".
interface Draft {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  text_ok: boolean;
  preferred_contact: string;
  address: string;
  city: string;
  lead_source: string;
  next_follow_up_date: string;
}

const emptyDraft: Draft = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  text_ok: false,
  preferred_contact: '',
  address: '',
  city: '',
  lead_source: '',
  next_follow_up_date: '',
};

interface PageError {
  title: string;
  message: string;
}

const SESSION_EXPIRED: PageError = {
  title: 'Your session has expired',
  message: 'Please log in again, then add the customer.',
};

const linkButtonStyles =
  'type-button inline-flex min-h-11 items-center justify-center rounded-sm border border-dark-brown bg-white px-5 py-2 text-dark-brown transition-colors hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber';

/** Add customer (K3, SSPMW-363): the owner types in a customer who called, texted or walked in. */
export default function AddCustomerPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [fieldErrors, setFieldErrors] = useState<NewCustomerFieldErrors>({});
  const [pageError, setPageError] = useState<PageError | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [focusRequest, setFocusRequest] = useState<{ field?: NewCustomerField } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);

  // Move focus to the first field with an error, or to the banner, after each failed save.
  useEffect(() => {
    if (saving || !focusRequest) return;
    const target = focusRequest.field
      ? formRef.current?.elements.namedItem(focusRequest.field)
      : bannerRef.current;
    if (target instanceof HTMLElement) target.focus();
  }, [focusRequest, saving]);

  function updateField<K extends keyof Draft>(field: K, value: Draft[K]) {
    const next = { ...draft, [field]: value };
    setDraft(next);
    setPageError(null);
    if (!attempted) return;
    // After the first save attempt, errors clear as soon as the field is fixed. Some
    // rules span two fields (phone or email), so both are rechecked.
    const result = newCustomerSchema.safeParse(next);
    const nextErrors = result.success ? {} : mapNewCustomerErrors(result.error).fieldErrors;
    setFieldErrors((previous) => {
      const updated = { ...previous };
      for (const key of newCustomerFields) {
        if (key === field || previous[key]) updated[key] = nextErrors[key];
      }
      return updated;
    });
  }

  function showErrors(errors: NewCustomerErrors, banner: PageError | null = null) {
    setFieldErrors(errors.fieldErrors);
    const formBanner =
      banner ??
      (errors.formErrors.length > 0
        ? { title: 'Please check the customer details', message: errors.formErrors.join(' ') }
        : null);
    setPageError(formBanner);
    const field = newCustomerFields.find((key) => errors.fieldErrors[key]);
    setFocusRequest({ field: formBanner ? undefined : field });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    setAttempted(true);
    setFocusRequest(null);
    setPageError(null);

    const local = newCustomerSchema.safeParse(draft);
    if (!local.success) {
      showErrors(mapNewCustomerErrors(local.error));
      return;
    }
    const token = session?.access_token;
    if (!token) {
      showErrors({ fieldErrors: {}, formErrors: [] }, SESSION_EXPIRED);
      return;
    }

    inFlight.current = true;
    setSaving(true);
    try {
      const result = await createCustomer(token, local.data);
      switch (result.status) {
        case 'ok': {
          const state: CustomerAddedState = {
            customerAdded: `${result.customer.firstName} ${result.customer.lastName}`,
          };
          navigate(CUSTOMERS_PATH, { state });
          return;
        }
        case 'invalid':
          showErrors(result);
          return;
        case 'duplicate':
          showErrors(
            { fieldErrors: { [result.field]: result.message }, formErrors: [] },
            {
              title: 'This customer already exists',
              message: `${result.message} Search the customer list for them instead of adding them again.`,
            },
          );
          return;
        case 'unauthenticated':
          showErrors({ fieldErrors: {}, formErrors: [] }, SESSION_EXPIRED);
          return;
        case 'no-access':
          showErrors(
            { fieldErrors: {}, formErrors: [] },
            { title: 'You do not have access', message: 'Only an owner can add customers.' },
          );
          return;
        default:
          showErrors(
            { fieldErrors: {}, formErrors: [] },
            { title: 'We could not save the customer', message: CUSTOMER_SAVE_FAILED_MESSAGE },
          );
      }
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <main className="w-full px-4 py-6 md:px-8">
      <Link to={CUSTOMERS_PATH} className="type-body text-walnut underline">
        Back to customers
      </Link>
      <h1 className="type-h2 mt-3 text-dark-brown">Add customer</h1>
      <p className="type-body mt-1 text-neutral-600">
        For customers who call, text or come from Yelp, Google or a referral instead of the website
        form. A phone number or email is needed so you can reach them.
      </p>

      <form
        ref={formRef}
        noValidate
        onSubmit={handleSubmit}
        aria-label="Add customer"
        className="mt-6 flex max-w-3xl flex-col gap-6 rounded-lg border border-neutral-300 bg-white p-4 md:p-6"
      >
        {pageError && (
          <div ref={bannerRef} tabIndex={-1} className="focus-visible:outline-none">
            <ErrorBanner title={pageError.title} message={pageError.message} />
          </div>
        )}

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="type-h4 mb-2 text-dark-brown">Name</legend>
          <Input
            label="First name"
            name="first_name"
            autoComplete="off"
            maxLength={100}
            required
            value={draft.first_name}
            error={fieldErrors.first_name}
            onChange={(event) => updateField('first_name', event.target.value)}
          />
          <Input
            label="Last name"
            name="last_name"
            autoComplete="off"
            maxLength={100}
            required
            value={draft.last_name}
            error={fieldErrors.last_name}
            onChange={(event) => updateField('last_name', event.target.value)}
          />
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="type-h4 mb-2 text-dark-brown">Contact</legend>
          <Input
            label="Phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            maxLength={32}
            placeholder="(916) 555-0142"
            value={draft.phone}
            error={fieldErrors.phone}
            onChange={(event) => updateField('phone', event.target.value)}
          />
          <Input
            label="Email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="off"
            maxLength={254}
            value={draft.email}
            error={fieldErrors.email}
            onChange={(event) => updateField('email', event.target.value)}
          />
          <Select
            label="Preferred contact"
            name="preferred_contact"
            value={draft.preferred_contact}
            error={fieldErrors.preferred_contact}
            onChange={(event) => updateField('preferred_contact', event.target.value)}
          >
            <option value="">Not set</option>
            {preferredContactOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <div className="flex flex-col justify-center gap-2 sm:pt-7">
            <Checkbox
              label="OK to text this customer"
              name="text_ok"
              checked={draft.text_ok}
              aria-invalid={fieldErrors.text_ok ? true : undefined}
              aria-describedby={fieldErrors.text_ok ? 'text_ok-error' : undefined}
              onChange={(event) => updateField('text_ok', event.target.checked)}
            />
            {fieldErrors.text_ok && (
              <InlineFieldError id="text_ok-error" message={fieldErrors.text_ok} />
            )}
          </div>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="type-h4 mb-2 text-dark-brown">Address</legend>
          <Input
            label="Street address"
            name="address"
            autoComplete="off"
            maxLength={300}
            value={draft.address}
            error={fieldErrors.address}
            onChange={(event) => updateField('address', event.target.value)}
          />
          <Input
            label="City"
            name="city"
            autoComplete="off"
            maxLength={CITY_MAX_LENGTH}
            value={draft.city}
            error={fieldErrors.city}
            onChange={(event) => updateField('city', event.target.value)}
          />
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="type-h4 mb-2 text-dark-brown">Follow-up</legend>
          <Select
            label="Lead source"
            name="lead_source"
            value={draft.lead_source}
            error={fieldErrors.lead_source}
            onChange={(event) => updateField('lead_source', event.target.value)}
          >
            <option value="">Not set</option>
            {leadSourceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Input
            label="Next follow-up date"
            name="next_follow_up_date"
            type="date"
            value={draft.next_follow_up_date}
            error={fieldErrors.next_follow_up_date}
            onChange={(event) => updateField('next_follow_up_date', event.target.value)}
          />
        </fieldset>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link to={CUSTOMERS_PATH} className={linkButtonStyles}>
            Cancel
          </Link>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save customer'}
          </Button>
        </div>
      </form>
    </main>
  );
}
