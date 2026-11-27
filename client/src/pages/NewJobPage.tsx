import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  JOB_ESTIMATED_HOURS_MAX,
  JOB_ITEM_MAX,
  JOB_NOTES_MAX,
  JOB_START_DATE_PAST_MESSAGE,
  jobCreateStatusLabels,
  jobCreateStatuses,
  jobTypeOptions,
  leadSourceOptions,
  todayInBusinessZone,
  type JobCreateFieldErrors,
} from '@pmw/validation';
import { createJob } from '../api/createJob';
import { useCustomerOptions } from '../api/useCustomerOptions';
import { useAuth } from '../auth/AuthContext';
import { Button, ErrorBanner, Input, Select, Textarea } from '../components/ui';
import { routes } from '../config/site';
import {
  conflictMessage,
  emptyJobForm,
  hasErrors,
  pastDateMessage,
  toJobInput,
  validateJobForm,
  type JobFormValues,
} from '../lib/jobForm';
import NoPermissionPage from './NoPermissionPage';
import { ADD_CUSTOMER_PATH } from '../components/customers/customerRoutes';
import { jobCreatedState } from '../lib/jobCreated';

const linkButton =
  'type-button inline-flex min-h-11 items-center justify-center rounded-sm px-5 py-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber';
const outlineLink = `${linkButton} border border-dark-brown bg-white text-dark-brown hover:bg-neutral-100`;
const primaryLink = `${linkButton} bg-dark-brown text-white hover:bg-neutral-800`;

const requiredMark = (
  <span aria-hidden="true" className="text-error">
    {' '}
    *
  </span>
);

type Notice = { title: string; message: string } | null;

export default function NewJobPage() {
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const { state, retry } = useCustomerOptions();

  const [values, setValues] = useState<JobFormValues>(emptyJobForm);
  const [fieldErrors, setFieldErrors] = useState<JobCreateFieldErrors>({});
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<Notice>(null);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const inFlight = useRef(false);

  if (state.status === 'no-access') return <NoPermissionPage />;

  // Typing in a field clears that field's error and any banner about the last save.
  function change(field: keyof JobFormValues, errorField: keyof JobCreateFieldErrors) {
    return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const { value } = event.target;
      setValues((current) => ({ ...current, [field]: value }));
      setFieldErrors((current) => {
        if (!current[errorField]) return current;
        const next = { ...current };
        delete next[errorField];
        return next;
      });
      setNotice(null);
    };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    setNotice(null);
    setFormErrors([]);

    const errors = validateJobForm(values);
    setFieldErrors(errors.fieldErrors);
    if (hasErrors(errors)) {
      setFormErrors(errors.formErrors);
      return;
    }
    if (!accessToken) {
      setNotice({
        title: 'We could not save the job',
        message: 'Your session is no longer valid. Please log in again.',
      });
      return;
    }

    inFlight.current = true;
    setSaving(true);
    const result = await createJob(accessToken, toJobInput(values));
    inFlight.current = false;
    setSaving(false);

    switch (result.status) {
      case 'ok':
        navigate(routes.portalSchedule, { state: jobCreatedState(result.job.jobNumber) });
        return;
      case 'invalid':
        setFieldErrors(result.fieldErrors);
        setFormErrors(result.formErrors);
        return;
      case 'conflict':
        setNotice({
          title: 'Time conflict with another job',
          message: conflictMessage(result.conflict),
        });
        return;
      case 'unauthenticated':
        setNotice({
          title: 'We could not save the job',
          message: 'Your session is no longer valid. Please log in again.',
        });
        return;
      case 'no-access':
        setNotice({
          title: 'We could not save the job',
          message: 'You no longer have permission to create jobs.',
        });
        return;
      default:
        setNotice({
          title: 'We could not save the job',
          message: 'Check your connection and try again. Nothing was lost from the form.',
        });
    }
  }

  function content() {
    if (state.status === 'loading') {
      return (
        <p role="status" className="type-body mt-6 text-neutral-600">
          Loading customers...
        </p>
      );
    }

    if (state.status !== 'ok') {
      return (
        <div className="mt-6 flex max-w-3xl flex-col items-start gap-4">
          <ErrorBanner
            title="We could not load customers"
            message={
              state.status === 'unauthenticated'
                ? 'Your session is no longer valid. Please log in again.'
                : 'Check your connection and try again.'
            }
          />
          <Button variant="outline" onClick={retry}>
            Try again
          </Button>
        </div>
      );
    }

    if (state.customers.length === 0) {
      return (
        <div className="mt-6 flex max-w-3xl flex-col items-start gap-4">
          <p className="type-body text-neutral-600">
            There are no customers yet. A job needs a customer, so add one first.
          </p>
          <Link to={ADD_CUSTOMER_PATH} className={primaryLink}>
            Add customer
          </Link>
        </div>
      );
    }

    const pastDate = fieldErrors.start_date === JOB_START_DATE_PAST_MESSAGE;

    return (
      <form onSubmit={submit} noValidate className="mt-6 flex max-w-3xl flex-col gap-5">
        {formErrors.length > 0 && (
          <ErrorBanner title="Please check the job form" message={formErrors.join(' ')} />
        )}
        {pastDate && (
          <ErrorBanner
            title="Check the start date"
            message={pastDateMessage(todayInBusinessZone())}
          />
        )}
        {notice && <ErrorBanner title={notice.title} message={notice.message} />}

        <div className="grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <Select
              label={<>Customer{requiredMark}</>}
              value={values.customerId}
              onChange={change('customerId', 'customer_id')}
              error={fieldErrors.customer_id}
              aria-required="true"
            >
              <option value="">Select a customer</option>
              {state.customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.city ? `${customer.name} · ${customer.city}` : customer.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="md:col-span-2">
            <Input
              label={<>Item{requiredMark}</>}
              value={values.item}
              onChange={change('item', 'item')}
              error={fieldErrors.item}
              maxLength={JOB_ITEM_MAX}
              placeholder="For example: oak dining chairs"
              aria-required="true"
            />
          </div>

          <Select
            label="Job type"
            value={values.jobType}
            onChange={change('jobType', 'job_type')}
            error={fieldErrors.job_type}
          >
            <option value="">Not set</option>
            {jobTypeOptions.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>

          <Select
            label="Status"
            value={values.status}
            onChange={change('status', 'status')}
            error={fieldErrors.status}
          >
            {jobCreateStatuses.map((status) => (
              <option key={status} value={status}>
                {jobCreateStatusLabels[status]}
              </option>
            ))}
          </Select>

          <Input
            label="Start date"
            type="date"
            value={values.startDate}
            onChange={change('startDate', 'start_date')}
            error={pastDate ? undefined : fieldErrors.start_date}
          />

          <Input
            label="Due date"
            type="date"
            value={values.dueDate}
            onChange={change('dueDate', 'due_date')}
            error={fieldErrors.due_date}
          />

          <Select
            label="Lead source"
            value={values.leadSource}
            onChange={change('leadSource', 'lead_source')}
            error={fieldErrors.lead_source}
          >
            <option value="">Not set</option>
            {leadSourceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          <Input
            label="Estimated hours"
            type="number"
            inputMode="decimal"
            min={0}
            max={JOB_ESTIMATED_HOURS_MAX}
            step="0.25"
            value={values.estimatedHours}
            onChange={change('estimatedHours', 'estimated_hours')}
            error={fieldErrors.estimated_hours}
          />

          <div className="md:col-span-2">
            <Textarea
              label="Job notes"
              value={values.notes}
              onChange={change('notes', 'notes')}
              error={fieldErrors.notes}
              maxLength={JOB_NOTES_MAX}
            />
          </div>
        </div>

        {pastDate && (
          <p className="type-body-sm text-error" role="alert">
            {JOB_START_DATE_PAST_MESSAGE}
          </p>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link to={routes.portalSchedule} className={outlineLink}>
            Cancel
          </Link>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save job'}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <main className="w-full px-4 py-6 md:px-8">
      <Link
        to={routes.portalSchedule}
        className="type-body-sm rounded-sm text-walnut underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
      >
        Back to Jobs
      </Link>
      <h1 className="type-h2 mt-3">New job</h1>
      <p className="type-body mt-1 text-neutral-600">
        Fields marked * are required. Everything else can be filled in later.
      </p>
      {content()}
    </main>
  );
}
