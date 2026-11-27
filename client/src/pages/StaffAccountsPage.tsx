import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  changeStaffRole,
  removeStaffAccount,
  type StaffAccount,
  type StaffMutationResult,
} from '../api/staff';
import { useStaffAccounts, type StaffAccountsState } from '../api/useStaffAccounts';
import {
  Badge,
  Button,
  ConfirmationDialog,
  ErrorBanner,
  Modal,
  Table,
  Toast,
  type TableColumn,
} from '../components/ui';
import { formatLastLogin, roleLabels, statusBadgeVariants, statusLabels } from '../lib/staffFormat';
import NoPermissionPage from './NoPermissionPage';

type StaffDialog =
  | { kind: 'role'; person: StaffAccount; role: StaffAccount['role'] }
  | { kind: 'remove'; person: StaffAccount }
  | null;

function mutationError(result: Exclude<StaffMutationResult, { status: 'ok' }>): string {
  switch (result.status) {
    case 'unauthenticated':
      return 'Your session has expired. Please sign in again.';
    case 'no-access':
      return 'You do not have permission to change staff accounts.';
    case 'not-found':
      return 'This staff account could not be found. Refresh the page and try again.';
    case 'conflict':
      return result.message ?? 'This change conflicts with staff account protections.';
    case 'error':
      return 'The request could not be completed. Check your connection and try again.';
  }
}

function StaffActions({
  person,
  currentUserId,
  disabled,
  onChangeRole,
  onRemove,
}: {
  person: StaffAccount;
  currentUserId: string | undefined;
  disabled: boolean;
  onChangeRole: (person: StaffAccount) => void;
  onRemove: (person: StaffAccount) => void;
}) {
  if (person.status === 'inactive') {
    return <span className="type-body-sm text-neutral-600">Inactive account</span>;
  }
  if (person.id === currentUserId) {
    return <span className="type-body-sm text-neutral-600">Your account</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        disabled={disabled}
        onClick={() => onChangeRole(person)}
        aria-label={`Change role for ${person.fullName}`}
      >
        Change role
      </Button>
      <Button
        variant="danger"
        disabled={disabled}
        onClick={() => onRemove(person)}
        aria-label={`Remove ${person.fullName}`}
      >
        Remove
      </Button>
    </div>
  );
}

const baseColumns: TableColumn<StaffAccount>[] = [
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

function StaffCards({
  staff,
  currentUserId,
  disabled,
  onChangeRole,
  onRemove,
}: {
  staff: StaffAccount[];
  currentUserId: string | undefined;
  disabled: boolean;
  onChangeRole: (person: StaffAccount) => void;
  onRemove: (person: StaffAccount) => void;
}) {
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
          <div className="mt-4">
            <StaffActions
              person={person}
              currentUserId={currentUserId}
              disabled={disabled}
              onChangeRole={onChangeRole}
              onRemove={onRemove}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function StaffContent({
  state,
  retry,
  currentUserId,
  disabled,
  onChangeRole,
  onRemove,
}: {
  state: StaffAccountsState;
  retry: () => void;
  currentUserId: string | undefined;
  disabled: boolean;
  onChangeRole: (person: StaffAccount) => void;
  onRemove: (person: StaffAccount) => void;
}) {
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

  const columns: TableColumn<StaffAccount>[] = [
    ...baseColumns,
    {
      key: 'id',
      header: 'Actions',
      render: (_value, person) => (
        <StaffActions
          person={person}
          currentUserId={currentUserId}
          disabled={disabled}
          onChangeRole={onChangeRole}
          onRemove={onRemove}
        />
      ),
    },
  ];

  return (
    <>
      <div className="hidden md:block">
        <Table columns={columns} rows={state.staff} rowKey="id" caption="Staff accounts" />
      </div>
      <StaffCards
        staff={state.staff}
        currentUserId={currentUserId}
        disabled={disabled}
        onChangeRole={onChangeRole}
        onRemove={onRemove}
      />
    </>
  );
}

export default function StaffAccountsPage() {
  const { session } = useAuth();
  const { state, retry, updateRole, markInactive } = useStaffAccounts();
  const [dialog, setDialog] = useState<StaffDialog>(null);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<string>();
  const mutationInProgress = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusPageAfterRemoval = useRef(false);

  useEffect(() => {
    if (!dialog && focusPageAfterRemoval.current) {
      headingRef.current?.focus();
      focusPageAfterRemoval.current = false;
    }
  }, [dialog]);

  if (state.status === 'no-access') return <NoPermissionPage />;

  function openRoleDialog(person: StaffAccount) {
    setError(undefined);
    setDialog({
      kind: 'role',
      person,
      role: person.role === 'owner' ? 'employee' : 'owner',
    });
  }

  function openRemoveDialog(person: StaffAccount) {
    setError(undefined);
    setDialog({ kind: 'remove', person });
  }

  function closeDialog() {
    if (mutationInProgress.current) return;
    setDialog(null);
    setError(undefined);
  }

  async function saveRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dialog?.kind !== 'role' || mutationInProgress.current) return;
    const token = session?.access_token;
    if (!token) {
      setError(mutationError({ status: 'unauthenticated' }));
      return;
    }

    mutationInProgress.current = true;
    setPending(true);
    setError(undefined);
    try {
      const result = await changeStaffRole(token, dialog.person.id, dialog.role);
      if (result.status === 'ok') {
        updateRole(dialog.person.id, dialog.role);
        setDialog(null);
        setToast('Role updated');
      } else {
        setError(mutationError(result));
      }
    } finally {
      mutationInProgress.current = false;
      setPending(false);
    }
  }

  async function confirmRemoval() {
    if (dialog?.kind !== 'remove' || mutationInProgress.current) return;
    const token = session?.access_token;
    if (!token) {
      setError(mutationError({ status: 'unauthenticated' }));
      return;
    }

    mutationInProgress.current = true;
    setPending(true);
    setError(undefined);
    try {
      const result = await removeStaffAccount(token, dialog.person.id);
      if (result.status === 'ok') {
        markInactive(dialog.person.id);
        focusPageAfterRemoval.current = true;
        setDialog(null);
        setToast('Employee removed');
      } else {
        setError(mutationError(result));
      }
    } finally {
      mutationInProgress.current = false;
      setPending(false);
    }
  }

  const roleDialog = dialog?.kind === 'role' ? dialog : null;
  const removeDialog = dialog?.kind === 'remove' ? dialog : null;

  return (
    <main className="w-full px-4 py-6 md:px-8">
      <h1 ref={headingRef} tabIndex={-1} className="sr-only">
        Staff accounts
      </h1>
      <p className="type-body text-neutral-600">
        People who can log in to the owner tools. Only owners can see this page.
      </p>
      <div className="mt-6">
        <StaffContent
          state={state}
          retry={retry}
          currentUserId={session?.user.id}
          disabled={pending}
          onChangeRole={openRoleDialog}
          onRemove={openRemoveDialog}
        />
      </div>

      {roleDialog && (
        <Modal isOpen onClose={closeDialog} title={`Change role for ${roleDialog.person.fullName}`}>
          <form onSubmit={saveRole} className="flex flex-col gap-6">
            <div>
              <label htmlFor="staff-role" className="type-label mb-2 block text-dark-brown">
                New role
              </label>
              <select
                id="staff-role"
                value={roleDialog.role}
                onChange={(event) =>
                  setDialog({
                    ...roleDialog,
                    role: event.target.value === 'owner' ? 'owner' : 'employee',
                  })
                }
                disabled={pending}
                className="type-body min-h-11 w-full rounded-sm border border-neutral-500 bg-white px-3 text-dark-brown focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
              >
                <option value="owner">Owner</option>
                <option value="employee">Employee</option>
              </select>
            </div>
            {error && <ErrorBanner message={error} />}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={closeDialog} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving...' : 'Save role'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {removeDialog && (
        <ConfirmationDialog
          isOpen
          onCancel={closeDialog}
          onConfirm={confirmRemoval}
          title="Remove staff account?"
          message={`${removeDialog.person.fullName} will lose access to the owner tools, and their active sessions will be revoked.`}
          confirmLabel="Remove"
          confirmingLabel="Removing..."
          destructive
          error={error}
        />
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(undefined)} />}
    </main>
  );
}
