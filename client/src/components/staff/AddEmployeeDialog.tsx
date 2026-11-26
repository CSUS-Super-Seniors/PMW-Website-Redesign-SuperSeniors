import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  mapStaffInviteErrors,
  staffInviteSchema,
  staffRoleOptions,
  type StaffInviteFieldErrors,
} from '@pmw/validation';
import type { StaffAccount } from '../../api/staff';
import { inviteStaff, type StaffInviteResult } from '../../api/staffInvite';
import { useAuth } from '../../auth/AuthContext';
import { roleLabels } from '../../lib/staffFormat';
import { Button, ErrorBanner, Input, Modal, Select, SuccessBanner } from '../ui';

export interface AddEmployeeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Adds the invited person to the list behind the dialog. */
  onInvited?: (staff: StaffAccount) => void;
}

type RequestProblem = Exclude<StaffInviteResult['status'], 'ok' | 'invalid'>;

const problemMessages: Record<RequestProblem, string> = {
  unauthenticated: 'Your session has expired. Please log in again.',
  'no-access': 'Only an owner can add staff.',
  'rate-limited': 'Too many emails were sent in the last hour. Please try again later.',
  error: 'The invite could not be sent. Check your connection and try again.',
};

const FIELD_ORDER = ['fullName', 'email', 'role'] as const;

export function AddEmployeeDialog(props: AddEmployeeDialogProps) {
  // The body only exists while the dialog is open, so every opening starts empty.
  if (!props.isOpen) return null;
  return <AddEmployeeDialogBody {...props} />;
}

function AddEmployeeDialogBody({ onClose, onInvited }: AddEmployeeDialogProps) {
  const { session } = useAuth();
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<StaffInviteFieldErrors>({});
  const [problem, setProblem] = useState<RequestProblem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [invited, setInvited] = useState<{
    staff: StaffAccount;
    resent: boolean;
    /** The role the owner picked, which a re-invite does not apply. */
    chosenRole: StaffAccount['role'];
  } | null>(null);
  // A ref as well as state, so Escape pressed in the same tick still sees it.
  const sending = useRef(false);

  // Start in the name field rather than on the close button. This runs after the
  // Modal's own focus effect, because a parent's effects run after its children's.
  useEffect(() => {
    if (!invited) formRef.current?.querySelector<HTMLElement>('[name="fullName"]')?.focus();
  }, [invited]);

  function focusFirstError(fieldErrors: StaffInviteFieldErrors) {
    const first = FIELD_ORDER.find((field) => fieldErrors[field]);
    if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    const data = new FormData(event.currentTarget);
    const parsed = staffInviteSchema.safeParse({
      fullName: String(data.get('fullName') ?? ''),
      email: String(data.get('email') ?? ''),
      role: String(data.get('role') ?? ''),
    });
    setProblem(null);
    if (!parsed.success) {
      const { fieldErrors } = mapStaffInviteErrors(parsed.error);
      setErrors(fieldErrors);
      focusFirstError(fieldErrors);
      return;
    }
    setErrors({});

    const token = session?.access_token;
    if (!token) {
      setProblem('unauthenticated');
      return;
    }

    sending.current = true;
    setSubmitting(true);
    let result: StaffInviteResult;
    try {
      result = await inviteStaff(token, parsed.data);
    } finally {
      sending.current = false;
      setSubmitting(false);
    }

    if (result.status === 'ok') {
      setInvited({ staff: result.staff, resent: result.resent, chosenRole: parsed.data.role });
      onInvited?.(result.staff);
    } else if (result.status === 'invalid') {
      setErrors(result.fieldErrors);
      focusFirstError(result.fieldErrors);
    } else {
      setProblem(result.status);
    }
  }

  // Escape, the close button and a click outside are ignored while the invite is sending.
  function handleClose() {
    if (!sending.current) onClose();
  }

  if (invited) {
    const { staff, resent, chosenRole } = invited;
    const role = roleLabels[staff.role];
    const roleIgnored = resent && chosenRole !== staff.role;
    return (
      <Modal isOpen onClose={onClose} title="Invite sent">
        <div className="flex flex-col gap-6">
          <SuccessBanner
            title={
              resent ? `${staff.fullName}'s invite was sent again` : `${staff.fullName} was invited`
            }
            message={`We emailed ${staff.email ?? 'them'} a${resent ? ' new' : ''} link to set a password. The link works for 1 hour.`}
          />
          {roleIgnored && (
            <p className="type-label text-dark-brown">
              Their role is still {role}. You chose {roleLabels[chosenRole]}, but sending an invite
              again does not change the role.
            </p>
          )}
          <p className="type-body text-dark-brown">
            {resent
              ? `They were already invited, so their details did not change. They stay on the staff list as ${role}.`
              : `They are on the staff list as ${role} and can log in once they set their password.`}
          </p>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setInvited(null)}>
              Add another
            </Button>
            <Button type="button" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen onClose={handleClose} title="Add employee">
      <form ref={formRef} className="flex flex-col gap-5" noValidate onSubmit={handleSubmit}>
        <p className="type-body text-neutral-600">
          We will email them a link to set their own password. No one has to share a password.
        </p>
        {problem && (
          <ErrorBanner message={problemMessages[problem]} onDismiss={() => setProblem(null)} />
        )}
        <Input
          label="Full name"
          name="fullName"
          autoComplete="off"
          maxLength={100}
          error={errors.fullName}
        />
        <Input
          label="Email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={254}
          placeholder="name@example.com"
          error={errors.email}
        />
        <Select
          label="Role"
          name="role"
          defaultValue=""
          error={errors.role}
          aria-describedby="add-employee-role-hint"
        >
          <option value="" disabled>
            Choose a role
          </option>
          {staffRoleOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <p id="add-employee-role-hint" className="type-body-sm -mt-3 text-neutral-600">
          Owners can open every page, including Staff accounts. Employees cannot.
        </p>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Sending invite...' : 'Send invite'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
