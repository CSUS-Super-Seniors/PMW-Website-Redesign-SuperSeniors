import { Outlet, useNavigate } from 'react-router';
import { useAuth } from '../../auth/AuthContext';
import { useIdleTimeout } from '../../auth/useIdleTimeout';
import { idleTimeout, routes } from '../../config/site';
import { SessionTimeoutDialog } from './SessionTimeoutDialog';
import { useRef, useState } from 'react';
import { ConfirmationDialog } from '../ui';
import PortalSidebar from './PortalSidebar';
import PortalTopBar from './PortalTopBar';
import PortalBottomNav from './PortalBottomNav';

export default function PortalLayout() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleTimeout() {
    navigate(routes.staffSessionExpired);
    await signOut();
  }

  const { isIdle, stayLoggedIn } = useIdleTimeout(
    handleTimeout,
    idleTimeout.idleWarningMinutes,
    idleTimeout.idleWarningDurationMinutes,
  );

  const [confirmLogout, setConfirmLogout] = useState(false);
  const [logoutError, setLogoutError] = useState<string>();
  const logoutPending = useRef(false);
  const fullName: unknown = session?.user.user_metadata?.full_name;
  const displayName =
    (typeof fullName === 'string' && fullName.trim()) || session?.user.email || 'Staff account';

  async function handleLogout() {
    if (logoutPending.current) return;
    logoutPending.current = true;
    setLogoutError(undefined);
    try {
      const result = await signOut();
      if (result !== 'success') {
        setLogoutError('We could not log you out. Check your connection and try again.');
      }
      // RequireAuth replaces the portal URL with Staff login when the session becomes null.
    } finally {
      logoutPending.current = false;
    }
  }

  return (
    <div className="flex min-h-dvh">
      <PortalSidebar displayName={displayName} onLogout={() => setConfirmLogout(true)} />
      <div className="flex min-w-0 flex-1 flex-col bg-neutral-50">
        <PortalTopBar displayName={displayName} onLogout={() => setConfirmLogout(true)} />
        <div className="flex-1 pb-16 md:pb-0">
          <Outlet />
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-40 md:hidden">
        <PortalBottomNav />
      </div>
      <SessionTimeoutDialog
        isOpen={isIdle}
        onStaySignedIn={stayLoggedIn}
        warningMinutes={idleTimeout.idleWarningDurationMinutes}
      />
      <ConfirmationDialog
        isOpen={confirmLogout}
        onCancel={() => {
          if (logoutPending.current) return;
          setConfirmLogout(false);
          setLogoutError(undefined);
        }}
        onConfirm={handleLogout}
        title="Log out?"
        message="Are you sure you want to log out of your staff account?"
        confirmLabel="Log out"
        confirmingLabel="Logging out..."
        error={logoutError}
      />
    </div>
  );
}
