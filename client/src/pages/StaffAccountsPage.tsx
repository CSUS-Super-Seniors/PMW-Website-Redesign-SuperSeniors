import { Badge, Button, ErrorBanner, Table, type TableColumn } from '../components/ui';
import type { StaffAccount } from '../api/staff';
import { useStaffAccounts, type StaffAccountsState } from '../api/useStaffAccounts';
import { formatLastLogin, roleLabels, statusBadgeVariants, statusLabels } from '../lib/staffFormat';
import NoPermissionPage from './NoPermissionPage';

const columns: TableColumn<StaffAccount>[] = [
  { key: 'fullName', header: 'Name' },
  { key: 'email', header: 'Email', render: (_value, row) => row.email ?? 'No email on file' },
  {
    key: 'role',
    header: 'Role',
    render: (_value, row) => <Badge>{roleLabels[row.role]}</Badge>,
  },
  {
    key: 'lastLoginAt',
    header: 'Last login',
    render: (_value, row) => formatLastLogin(row.lastLoginAt),
  },
  {
    key: 'status',
    header: 'Status',
    render: (_value, row) => (
      <Badge variant={statusBadgeVariants[row.status]}>{statusLabels[row.status]}</Badge>
    ),
  },
];

function StaffCards({ staff }: { staff: StaffAccount[] }) {
  return (
    <ul className="space-y-3 md:hidden">
      {staff.map((person) => (
        <li key={person.id} className="rounded-lg border border-neutral-300 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="type-label break-words text-dark-brown">{person.fullName}</p>
              <p className="type-body-sm text-neutral-600">{roleLabels[person.role]}</p>
            </div>
            <Badge variant={statusBadgeVariants[person.status]}>
              {statusLabels[person.status]}
            </Badge>
          </div>
          <dl className="type-body-sm mt-3 space-y-1">
            <div className="flex gap-2">
              <dt className="shrink-0 text-neutral-600">Email</dt>
              <dd className="min-w-0 break-all text-neutral-800">
                {person.email ?? 'No email on file'}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 text-neutral-600">Last login</dt>
              <dd className="text-neutral-800">{formatLastLogin(person.lastLoginAt)}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}

function StaffContent({ state, retry }: { state: StaffAccountsState; retry: () => void }) {
  if (state.status === 'loading') {
    return (
      <p role="status" className="type-body text-neutral-600">
        Loading staff accounts...
      </p>
    );
  }

  if (state.status !== 'ok') {
    const message =
      state.status === 'unauthenticated'
        ? 'Your session is no longer valid. Please log in again.'
        : 'Check your connection and try again.';
    return (
      <div className="space-y-4">
        <ErrorBanner title="We could not load staff accounts" message={message} />
        <Button variant="outline" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  }

  if (state.staff.length === 0) {
    return <p className="type-body text-neutral-600">There are no staff accounts yet.</p>;
  }

  return (
    <>
      <div className="hidden md:block">
        <Table columns={columns} rows={state.staff} rowKey="id" caption="Staff accounts" />
      </div>
      <StaffCards staff={state.staff} />
    </>
  );
}

export default function StaffAccountsPage() {
  const { state, retry } = useStaffAccounts();

  if (state.status === 'no-access') return <NoPermissionPage />;

  return (
    <main className="w-full px-4 py-6 md:px-8">
      <h1 className="sr-only">Staff accounts</h1>
      <p className="type-body text-neutral-600">
        People who can log in to the owner tools. Only owners can see this page.
      </p>
      <div className="mt-6">
        <StaffContent state={state} retry={retry} />
      </div>
    </main>
  );
}
