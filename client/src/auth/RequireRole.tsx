import { Outlet } from 'react-router';
import { useStaffRole } from './useStaffRole';
import type { StaffRole } from './fetchStaffProfile';
import NoPermissionPage from '../pages/NoPermissionPage';

type RequireRoleProps = { allowed: StaffRole[] };

export default function RequireRole({ allowed }: RequireRoleProps) {
  const state = useStaffRole();

  if (state.status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-neutral-50">
        <p role="status" className="type-body text-neutral-600">
          Loading...
        </p>
      </div>
    );
  }

  if (state.status === 'ok' && allowed.includes(state.role)) {
    return <Outlet />;
  }

  return <NoPermissionPage />;
}
