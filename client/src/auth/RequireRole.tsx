import { useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router';
import { useAuth } from './AuthContext';
import { useStaffRole } from './useStaffRole';
import type { StaffRole } from './fetchStaffProfile';
import NoPermissionPage from '../pages/NoPermissionPage';
import AccessCheckFailedPage from '../pages/AccessCheckFailedPage';

type RequireRoleProps = { allowed: StaffRole[] };

export default function RequireRole({ allowed }: RequireRoleProps) {
  const { state, retry } = useStaffRole();
  const { signOut } = useAuth();
  const [signOutFailed, setSignOutFailed] = useState(false);
  const signOutRef = useRef(signOut);
  const loginRejected = state.status === 'unauthenticated';

  useEffect(() => {
    signOutRef.current = signOut;
  }, [signOut]);

  // The server rejected a login the browser still holds. Clear it and RequireAuth (the
  // parent route) sends the person to staff login. Redirecting without clearing it loops.
  useEffect(() => {
    if (!loginRejected) return;
    let cancelled = false;
    signOutRef.current().then((result) => {
      if (!cancelled && result === 'failed') setSignOutFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [loginRejected]);

  function handleRetry() {
    setSignOutFailed(false);
    retry();
  }

  if (state.status === 'loading' || (loginRejected && !signOutFailed)) {
    return (
      <div className="flex min-h-96 items-center justify-center bg-neutral-50">
        <p role="status" className="type-body text-neutral-600">
          Loading...
        </p>
      </div>
    );
  }

  if (state.status === 'unreachable' || loginRejected) {
    return <AccessCheckFailedPage onRetry={handleRetry} />;
  }

  if (state.status === 'ok' && allowed.includes(state.role)) {
    return <Outlet />;
  }

  return <NoPermissionPage />;
}
