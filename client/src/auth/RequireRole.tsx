import { Navigate, Outlet, useLocation } from 'react-router';
import { routes } from '../config/site';
import { useStaffRole } from './useStaffRole';
import type { StaffRole } from './fetchStaffProfile';
import NoPermissionPage from '../pages/NoPermissionPage';
import AccessCheckFailedPage from '../pages/AccessCheckFailedPage';

type RequireRoleProps = { allowed: StaffRole[] };

export default function RequireRole({ allowed }: RequireRoleProps) {
  const { state, retry } = useStaffRole();
  const location = useLocation();

  if (state.status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-neutral-50">
        <p role="status" className="type-body text-neutral-600">
          Loading...
        </p>
      </div>
    );
  }

  if (state.status === 'unauthenticated') {
    return (
      <Navigate
        to={routes.staffLogin}
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  if (state.status === 'unreachable') {
    return <AccessCheckFailedPage onRetry={retry} />;
  }

  if (state.status === 'ok' && allowed.includes(state.role)) {
    return <Outlet />;
  }

  return <NoPermissionPage />;
}
