import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import {
  Badge,
  Button,
  ErrorBanner,
  Input,
  Pagination,
  Select,
  SuccessBanner,
} from '../components/ui';
import {
  DEFAULT_JOB_PAGE_SIZE,
  JOB_PAGE_SIZES,
  JOB_SEARCH_MAX_LENGTH,
  JOB_STATUSES,
  type JobStatus,
} from '../api/jobs';
import { useJobs } from '../api/useJobs';
import { formatJobDate, jobStatusBadgeVariants, jobStatusLabels } from '../lib/jobFormat';
import { useStaffRole } from '../auth/useStaffRole';
import { routes } from '../config/site';
import { readCreatedJobNumber } from '../lib/jobCreated';
import NoPermissionPage from './NoPermissionPage';

const pageSizes: readonly number[] = JOB_PAGE_SIZES;
const SEARCH_DELAY_MS = 300;

function jobDetailPath(id: string): string {
  return `/portal/jobs/${encodeURIComponent(id)}`;
}

function readListParams(params: URLSearchParams): {
  page: number;
  pageSize: number;
  status: JobStatus | null;
  search: string;
} {
  const page = Number(params.get('page'));
  const pageSize = Number(params.get('pageSize'));
  const status = JOB_STATUSES.find((allowed) => allowed === params.get('status')) ?? null;
  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    pageSize: pageSizes.includes(pageSize) ? pageSize : DEFAULT_JOB_PAGE_SIZE,
    status,
    search: (params.get('q') ?? '').trim().slice(0, JOB_SEARCH_MAX_LENGTH),
  };
}

export default function JobsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  // Only owners can create jobs, so only they see the button.
  const { state: roleState } = useStaffRole();
  const isOwner = roleState.status === 'ok' && roleState.role === 'owner';
  const createdNumber = readCreatedJobNumber(location.state);
  const { page, pageSize, status, search } = readListParams(searchParams);
  const { state, retry } = useJobs({ page, pageSize, status, search });
  // What the staff member has typed. The URL (and the list) follows after a short pause.
  const [searchText, setSearchText] = useState(search);
  // When the URL's search changes some other way (Back, Forward, a shared link), the box
  // follows it. Text that only differs by spaces is left alone, so typing a space is safe.
  const [seenSearch, setSeenSearch] = useState(search);
  if (search !== seenSearch) {
    setSeenSearch(search);
    if (searchText.trim() !== search) setSearchText(search);
  }
  const filtersActive = status !== null || search !== '';

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const trimmed = searchText.trim();
      if (trimmed === search) return;
      const next = new URLSearchParams(searchParams);
      if (trimmed) next.set('q', trimmed);
      else next.delete('q');
      next.delete('page');
      setSearchParams(next);
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [searchText, search, searchParams, setSearchParams]);

  function showPage(nextPage: number, nextPageSize = pageSize) {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(nextPage));
    next.set('pageSize', String(nextPageSize));
    setSearchParams(next);
  }

  function chooseStatus(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('status', value);
    else next.delete('status');
    next.delete('page');
    setSearchParams(next);
  }

  function clearFilters() {
    setSearchText('');
    const next = new URLSearchParams(searchParams);
    next.delete('status');
    next.delete('q');
    next.delete('page');
    setSearchParams(next);
  }

  const lastPage = state.status === 'ok' ? Math.max(1, Math.ceil(state.total / pageSize)) : 1;
  // Jobs can change while staff are on a later page. Move back to the last page that
  // has rows instead of showing an empty list.
  const pastTheEnd = state.status === 'ok' && state.total > 0 && page > lastPage;

  useEffect(() => {
    if (!pastTheEnd) return;
    const next = new URLSearchParams(searchParams);
    next.set('page', String(lastPage));
    setSearchParams(next, { replace: true });
  }, [pastTheEnd, lastPage, searchParams, setSearchParams]);

  if (state.status === 'no-access') return <NoPermissionPage />;

  let content;
  if (state.status === 'loading' || pastTheEnd) {
    content = (
      <p role="status" className="type-body text-neutral-600">
        Loading jobs...
      </p>
    );
  } else if (state.status !== 'ok') {
    content = (
      <div className="space-y-4">
        <ErrorBanner
          title="We could not load jobs"
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
    content = filtersActive ? (
      <div className="rounded-md border border-neutral-300 bg-white px-4 py-10 text-center">
        <p className="type-h4">No matching jobs</p>
        <p className="type-body mt-2 text-neutral-600">
          Try a different search or status, or clear the filters to see every job.
        </p>
        <div className="mt-4">
          <Button variant="outline" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      </div>
    ) : (
      <div className="rounded-md border border-neutral-300 bg-white px-4 py-10 text-center">
        <p className="type-h4">No jobs yet</p>
        <p className="type-body mt-2 text-neutral-600">
          Jobs show up here after you accept an estimate request.
        </p>
      </div>
    );
  } else {
    const filterParts = [
      status ? jobStatusLabels[status] : null,
      search ? `“${search}”` : null,
    ].filter(Boolean);
    const noun = state.total === 1 ? 'job' : 'jobs';
    const summary = filtersActive
      ? `${filterParts.join(' · ')} · ${state.total} matching ${noun}`
      : `${state.total} ${noun}`;

    content = (
      <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="type-h4" aria-live="polite">
            {summary}
          </h2>
          {filtersActive && (
            <Button variant="outline" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
        <ul className="mt-4 space-y-3">
          {state.jobs.map((job) => {
            const due = formatJobDate(job.dueDate);
            const start = formatJobDate(job.startDate);
            const details = [job.jobType, start ? `Starts ${start}` : null]
              .filter(Boolean)
              .join(' • ');
            return (
              <li
                key={job.id}
                className="flex cursor-pointer flex-col gap-3 rounded-md border border-neutral-300 bg-white p-4 hover:bg-neutral-50 sm:flex-row sm:items-center sm:justify-between"
                onClick={(event) => {
                  // Links and buttons inside the row handle their own clicks.
                  if (event.target instanceof Element && event.target.closest('a, button')) return;
                  navigate(jobDetailPath(job.id));
                }}
              >
                <div className="min-w-0 space-y-2">
                  <h3 className="type-h4 break-words">
                    <Link
                      to={jobDetailPath(job.id)}
                      className="rounded-sm text-dark-brown hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
                    >
                      {job.item}
                    </Link>
                  </h3>
                  <p className="type-body-sm text-neutral-600">
                    {job.customerName} • {job.jobNumber}
                  </p>
                  {details && <p className="type-body-sm text-neutral-600">{details}</p>}
                  <p className="type-body-sm flex flex-wrap items-center gap-2 text-neutral-600">
                    <Badge variant={jobStatusBadgeVariants[job.status]}>
                      {jobStatusLabels[job.status]}
                    </Badge>
                    <span>{due ? `Due ${due}` : 'No due date'}</span>
                  </p>
                </div>
                <Link
                  to={jobDetailPath(job.id)}
                  className="type-label inline-flex min-h-11 items-center justify-center rounded-sm border border-dark-brown px-4 py-2 text-dark-brown hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
                >
                  Open job <span className="sr-only">{job.jobNumber}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 w-40">
          <Select
            label="Rows per page"
            value={pageSize}
            onChange={(event) => showPage(1, Number(event.target.value))}
          >
            {JOB_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </Select>
        </div>
        <Pagination currentPage={page} totalPages={lastPage} onPageChange={(n) => showPage(n)} />
      </>
    );
  }

  return (
    <main className="w-full px-4 py-6 md:px-8">
      <h1 className="sr-only">Jobs</h1>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="type-body text-neutral-600">
          Manage job details, steps, and upcoming visits. Newest jobs first.
        </p>
        {isOwner && (
          <Link
            to={routes.portalNewJob}
            className="type-button inline-flex min-h-11 items-center justify-center rounded-sm bg-dark-brown px-5 py-2 text-white transition-colors hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
          >
            + New Job
          </Link>
        )}
      </div>
      {createdNumber && (
        <SuccessBanner
          className="mt-6"
          message={`Job ${createdNumber} saved successfully. Select its row to review details.`}
          onDismiss={() =>
            // Clearing the history entry keeps a refresh from showing the message again.
            navigate(
              { pathname: location.pathname, search: location.search },
              { replace: true, state: null },
            )
          }
        />
      )}
      <form
        role="search"
        className="mt-6 grid gap-4 sm:grid-cols-[1fr_14rem]"
        onSubmit={(event) => event.preventDefault()}
      >
        <Input
          label="Search jobs"
          type="search"
          value={searchText}
          maxLength={JOB_SEARCH_MAX_LENGTH}
          placeholder="Customer, item, type or job number"
          onChange={(event) => setSearchText(event.target.value)}
        />
        <Select
          label="Status"
          value={status ?? ''}
          onChange={(event) => chooseStatus(event.target.value)}
        >
          <option value="">All statuses</option>
          {JOB_STATUSES.map((value) => (
            <option key={value} value={value}>
              {jobStatusLabels[value]}
            </option>
          ))}
        </Select>
      </form>
      <div className="mt-6">{content}</div>
    </main>
  );
}
