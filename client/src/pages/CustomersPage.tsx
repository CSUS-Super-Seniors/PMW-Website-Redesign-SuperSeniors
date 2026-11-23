import { useCallback, useEffect, useId, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  CUSTOMER_PAGE_SIZES,
  CUSTOMER_SEARCH_MAX_LENGTH,
  DEFAULT_CUSTOMER_PAGE_SIZE,
  customerStatuses,
  type CustomerStatus,
} from '@pmw/validation';
import {
  Badge,
  Button,
  ErrorBanner,
  Input,
  Pagination,
  Select,
  Table,
  type DateRange,
  type TableColumn,
} from '../components/ui';
import type { CustomerListParams, CustomerSummary } from '../api/customers';
import { useCustomers } from '../api/useCustomers';
import { customerCount, formatLastJobDate, isCompleteDate } from '../lib/customerFormat';
import NoPermissionPage from './NoPermissionPage';

/** How long typing pauses before the search runs. */
export const SEARCH_DELAY_MS = 300;

const columns: TableColumn<CustomerSummary>[] = [
  {
    key: 'lastName',
    header: 'Name',
    render: (_value, row) => (
      <span className="type-label text-dark-brown">
        {`${row.firstName} ${row.lastName}`.trim()}
      </span>
    ),
  },
  { key: 'phone', header: 'Phone', render: (_value, row) => row.phone ?? 'Not provided' },
  { key: 'city', header: 'City', render: (_value, row) => row.city ?? 'Not provided' },
  {
    key: 'lastJobDate',
    header: 'Last job',
    render: (_value, row) =>
      row.lastJobDate ? (
        <time dateTime={row.lastJobDate}>{formatLastJobDate(row.lastJobDate)}</time>
      ) : (
        formatLastJobDate(null)
      ),
  },
  { key: 'jobCount', header: 'Jobs' },
  {
    key: 'isRepeat',
    header: 'Status',
    render: (_value, row) =>
      row.isRepeat ? <Badge variant="success">Repeat</Badge> : <Badge variant="info">New</Badge>,
  },
  { key: 'email', header: 'Email', render: (_value, row) => row.email ?? 'Not provided' },
];

const statusLabels: Record<CustomerStatus, string> = { new: 'New', repeat: 'Repeat' };
const pageSizes: readonly number[] = CUSTOMER_PAGE_SIZES;
const statusValues: readonly string[] = customerStatuses;

// The same look as the shared Input. Every toolbar box is h-14 (FILTER_HEIGHT), so the
// date boxes, the search box and the status menu line up.
const fieldClasses =
  'type-body-lg h-14 w-full min-w-0 rounded-sm border bg-white px-4 py-3 text-dark-brown focus-visible:outline-2 focus-visible:outline-offset-2';

const FILTER_HEIGHT = 'h-14';

/**
 * Start and end date side by side under one "Last job date" label, so the
 * toolbar's labels and boxes line up (Figma customer list). Each box keeps its
 * own label for screen readers, and a reversed range is flagged on the end date.
 */
function LastJobDateFilter({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
}) {
  const id = useId();
  const reversed = Boolean(
    isCompleteDate(value.startDate) &&
    isCompleteDate(value.endDate) &&
    value.endDate < value.startDate,
  );
  const ok = 'border-neutral-300 focus-visible:outline-amber';
  const bad = 'border-error focus-visible:outline-error';

  return (
    <div role="group" aria-labelledby={`${id}-label`} className="flex min-w-0 flex-col gap-2">
      <p id={`${id}-label`} className="type-label text-dark-brown">
        Last job date
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor={`${id}-start`} className="type-body-sm text-neutral-600 sm:sr-only">
          Start date
        </label>
        <input
          id={`${id}-start`}
          type="date"
          value={value.startDate}
          onChange={(event) => onChange({ ...value, startDate: event.target.value })}
          className={`${fieldClasses} ${ok} sm:w-44`}
        />
        <span aria-hidden="true" className="type-body hidden text-neutral-600 sm:inline">
          to
        </span>
        <label htmlFor={`${id}-end`} className="type-body-sm text-neutral-600 sm:sr-only">
          End date
        </label>
        <input
          id={`${id}-end`}
          type="date"
          value={value.endDate}
          min={value.startDate || undefined}
          onChange={(event) => onChange({ ...value, endDate: event.target.value })}
          aria-invalid={reversed || undefined}
          aria-describedby={reversed ? `${id}-error` : undefined}
          className={`${fieldClasses} ${reversed ? bad : ok} sm:w-44`}
        />
      </div>
      {reversed && (
        <p id={`${id}-error`} className="type-body-sm text-error" role="alert">
          End date must be on or after the start date.
        </p>
      )}
    </div>
  );
}

/** Reads the list's state from the URL, so a search can be shared, refreshed or gone back to. */
function readListParams(params: URLSearchParams): CustomerListParams {
  const page = Number(params.get('page'));
  const pageSize = Number(params.get('pageSize'));
  const status = params.get('status') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const datesValid =
    (from === '' || isCompleteDate(from)) &&
    (to === '' || isCompleteDate(to)) &&
    !(from && to && to < from);
  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    pageSize: pageSizes.includes(pageSize) ? pageSize : DEFAULT_CUSTOMER_PAGE_SIZE,
    search: (params.get('search') ?? '').trim().slice(0, CUSTOMER_SEARCH_MAX_LENGTH),
    status: statusValues.includes(status) ? (status as CustomerStatus) : '',
    from: datesValid ? from : '',
    to: datesValid ? to : '',
  };
}

export default function CustomersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const params = readListParams(searchParams);
  const { page, pageSize, search, status, from, to } = params;
  const { state, retry } = useCustomers(params);

  // What the owner has typed. The URL (and the request) follows after a pause.
  const [searchDraft, setSearchDraft] = useState(search);
  // Dates go to the URL only once the range is complete and in order.
  const [dateDraft, setDateDraft] = useState<DateRange>({ startDate: from, endDate: to });

  // An empty value removes the parameter, so the URL only holds filters in use.
  const updateParams = useCallback(
    (changes: Record<string, string>, options?: { replace?: boolean }) => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        for (const [name, value] of Object.entries(changes)) {
          if (value) next.set(name, value);
          else next.delete(name);
        }
        return next;
      }, options);
    },
    [setSearchParams],
  );

  // Back and forward change the URL; show what it holds. Done while rendering
  // (not in an effect) so the fields never show a stale value for a frame.
  const [shownUrl, setShownUrl] = useState({ search, from, to });
  if (shownUrl.search !== search || shownUrl.from !== from || shownUrl.to !== to) {
    setShownUrl({ search, from, to });
    if (searchDraft.trim() !== search) setSearchDraft(search);
    if (dateDraft.startDate !== from || dateDraft.endDate !== to) {
      setDateDraft({ startDate: from, endDate: to });
    }
  }

  const trimmedDraft = searchDraft.trim();
  useEffect(() => {
    if (trimmedDraft === search) return;
    const timer = window.setTimeout(() => {
      // A new search starts on page 1. Replace, so each keystroke is not a history entry.
      updateParams({ search: trimmedDraft, page: '' }, { replace: true });
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [trimmedDraft, search, updateParams]);

  function changeDates(range: DateRange) {
    setDateDraft(range);
    const startOk = range.startDate === '' || isCompleteDate(range.startDate);
    const endOk = range.endDate === '' || isCompleteDate(range.endDate);
    const ordered = !(range.startDate && range.endDate && range.endDate < range.startDate);
    if (startOk && endOk && ordered) {
      updateParams({ from: range.startDate, to: range.endDate, page: '' });
    }
  }

  const filtered = Boolean(search || status || from || to);
  // The empty state has its own clear button, so the toolbar one hides then.
  const noMatches = state.status === 'ok' && state.total === 0;

  function clearFilters() {
    setSearchDraft('');
    setDateDraft({ startDate: '', endDate: '' });
    updateParams({ search: '', status: '', from: '', to: '', page: '' });
  }

  const lastPage = state.status === 'ok' ? Math.max(1, Math.ceil(state.total / pageSize)) : 1;
  // Customers can be removed while the owner is on a later page. Move back to the
  // last page that has rows instead of showing an empty list.
  const pastTheEnd = state.status === 'ok' && state.total > 0 && page > lastPage;

  useEffect(() => {
    if (!pastTheEnd) return;
    updateParams({ page: String(lastPage) }, { replace: true });
  }, [pastTheEnd, lastPage, updateParams]);

  if (state.status === 'no-access') return <NoPermissionPage />;

  let content;
  if (state.status === 'loading' || pastTheEnd) {
    content = (
      <p role="status" className="type-body px-4 py-10 text-center text-neutral-600">
        Loading customers...
      </p>
    );
  } else if (state.status !== 'ok') {
    content = (
      <div className="space-y-4 p-4">
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
  } else if (state.total === 0) {
    content = filtered ? (
      <div className="px-4 py-10 text-center">
        <p className="type-h4">No customer found</p>
        <p className="type-body mt-2 text-neutral-600">
          No customers match your search and filters. Check the spelling or number, or clear the
          filters.
        </p>
        <Button variant="outline" className="mt-4" onClick={clearFilters}>
          Clear search and filters
        </Button>
      </div>
    ) : (
      <div className="px-4 py-10 text-center">
        <p className="type-h4">No customers yet</p>
        <p className="type-body mt-2 text-neutral-600">
          Customers are added when you accept an estimate request.
        </p>
      </div>
    );
  } else {
    content = (
      <Table
        columns={columns}
        rows={state.customers}
        rowKey="id"
        caption="Customers, by last name"
      />
    );
  }

  const showing =
    state.status === 'ok' && state.total > 0 && !pastTheEnd
      ? {
          first: (page - 1) * pageSize + 1,
          last: (page - 1) * pageSize + state.customers.length,
          total: state.total,
        }
      : null;

  return (
    <main className="w-full px-4 py-6 md:px-8">
      <h1 className="sr-only">Customers</h1>
      <p className="type-body text-neutral-600">
        View and manage your customers and their job history.
      </p>

      <section
        aria-label="Customer list"
        className="mt-6 rounded-md border border-neutral-300 bg-white"
      >
        {/* One row on wide screens: search takes the spare width, and every label sits
            on the same line above a box of the same height. */}
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto_11rem] lg:items-start">
          <form
            role="search"
            className="min-w-0"
            onSubmit={(event) => {
              event.preventDefault();
              updateParams({ search: trimmedDraft, page: '' });
            }}
          >
            <Input
              type="search"
              label="Search customers"
              placeholder="Search name, phone"
              value={searchDraft}
              maxLength={CUSTOMER_SEARCH_MAX_LENGTH}
              onChange={(event) => setSearchDraft(event.target.value)}
              autoComplete="off"
              className={FILTER_HEIGHT}
            />
          </form>
          <LastJobDateFilter value={dateDraft} onChange={changeDates} />
          <Select
            label="Status"
            value={status}
            className={FILTER_HEIGHT}
            onChange={(event) => updateParams({ status: event.target.value, page: '' })}
          >
            <option value="">All statuses</option>
            {customerStatuses.map((value) => (
              <option key={value} value={value}>
                {statusLabels[value]}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-y border-neutral-300 px-4 py-2">
          <p className="type-body-sm text-neutral-600" aria-live="polite">
            {state.status === 'ok' && !pastTheEnd ? customerCount(state.total) : ' '}
          </p>
          {filtered && !noMatches && (
            <Button variant="outline" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
        <div className="p-4">{content}</div>
      </section>

      {showing && (
        <>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <p className="type-body-sm text-neutral-600">
              Showing {showing.first} to {showing.last} of {customerCount(showing.total)}
            </p>
            <div className="w-40">
              <Select
                label="Rows per page"
                value={pageSize}
                onChange={(event) => updateParams({ pageSize: event.target.value, page: '' })}
              >
                {CUSTOMER_PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <Pagination
            currentPage={page}
            totalPages={lastPage}
            onPageChange={(next) => updateParams({ page: String(next) })}
          />
        </>
      )}
    </main>
  );
}
