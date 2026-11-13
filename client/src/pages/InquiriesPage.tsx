import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  Badge,
  Button,
  ErrorBanner,
  Pagination,
  Select,
  Table,
  type TableColumn,
} from '../components/ui';
import {
  DEFAULT_INQUIRY_PAGE_SIZE,
  INQUIRY_PAGE_SIZES,
  type InquirySummary,
} from '../api/inquiries';
import { useInquiries } from '../api/useInquiries';
import {
  formatSubmittedAt,
  inquiryStatusBadgeVariants,
  inquiryStatusLabels,
} from '../lib/inquiryFormat';
import { inquiryDetailPath } from '../config/site';
import NoPermissionPage from './NoPermissionPage';

const columns: TableColumn<InquirySummary>[] = [
  {
    key: 'customerName',
    header: 'Customer',
    // The link is how keyboard and screen reader users open a request.
    render: (_value, row) => (
      <Link
        to={inquiryDetailPath(row.id)}
        className="type-label rounded-sm text-walnut underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
      >
        {row.customerName}
      </Link>
    ),
  },
  { key: 'item', header: 'Item' },
  { key: 'city', header: 'City', render: (_value, row) => row.city ?? 'Not provided' },
  {
    key: 'submittedAt',
    header: 'Submitted',
    render: (_value, row) => (
      <time dateTime={row.submittedAt}>{formatSubmittedAt(row.submittedAt)}</time>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    render: (_value, row) => (
      <Badge variant={inquiryStatusBadgeVariants[row.status]}>
        {inquiryStatusLabels[row.status]}
      </Badge>
    ),
  },
];

const pageSizes: readonly number[] = INQUIRY_PAGE_SIZES;

function readListParams(params: URLSearchParams): { page: number; pageSize: number } {
  const page = Number(params.get('page'));
  const pageSize = Number(params.get('pageSize'));
  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    pageSize: pageSizes.includes(pageSize) ? pageSize : DEFAULT_INQUIRY_PAGE_SIZE,
  };
}

export default function InquiriesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { page, pageSize } = readListParams(searchParams);
  const { state, retry } = useInquiries(page, pageSize);

  function showPage(nextPage: number, nextPageSize = pageSize) {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(nextPage));
    next.set('pageSize', String(nextPageSize));
    setSearchParams(next);
  }

  const lastPage = state.status === 'ok' ? Math.max(1, Math.ceil(state.total / pageSize)) : 1;
  // Requests can be removed while the owner is on a later page. Move back to the
  // last page that has rows instead of showing an empty list.
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
        Loading estimate requests...
      </p>
    );
  } else if (state.status !== 'ok') {
    content = (
      <div className="space-y-4">
        <ErrorBanner
          title="We could not load estimate requests"
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
    content = (
      <div className="rounded-md border border-neutral-300 bg-white px-4 py-10 text-center">
        <p className="type-h4">No estimate requests yet</p>
        <p className="type-body mt-2 text-neutral-600">
          Requests sent from the website estimate form will show up here, newest first.
        </p>
      </div>
    );
  } else {
    const first = (page - 1) * pageSize + 1;
    const last = first + state.inquiries.length - 1;
    content = (
      <>
        <Table
          columns={columns}
          rows={state.inquiries}
          rowKey="id"
          caption="Estimate requests, newest first"
          onRowClick={(row) => navigate(inquiryDetailPath(row.id))}
        />
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <p className="type-body-sm text-neutral-600" aria-live="polite">
            Showing {first}–{last} of {state.total}
          </p>
          <div className="w-40">
            <Select
              label="Rows per page"
              value={pageSize}
              onChange={(event) => showPage(1, Number(event.target.value))}
            >
              {INQUIRY_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <Pagination currentPage={page} totalPages={lastPage} onPageChange={(n) => showPage(n)} />
      </>
    );
  }

  return (
    <main className="w-full px-4 py-6 md:px-8">
      <h1 className="sr-only">Estimate requests</h1>
      <p className="type-body text-neutral-600">
        Estimate requests from the website, newest first. Open a request to review it.
      </p>
      <div className="mt-6">{content}</div>
    </main>
  );
}
