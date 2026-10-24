import { Outlet, useNavigate } from 'react-router';
import { useAuth } from '../../auth/AuthContext';
import { useIdleTimeout } from '../../auth/useIdleTimeout';
import { idleTimeout, routes } from '../../config/site';
import { SessionTimeoutDialog } from './SessionTimeoutDialog';
import PortalSidebar from './PortalSidebar';
import PortalTopBar from './PortalTopBar';
import PortalBottomNav from './PortalBottomNav';

export default function PortalLayout() {
  const { signOut } = useAuth();
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

  return (
    <div className="flex min-h-dvh">
      <PortalSidebar />
      <div className="flex flex-1 flex-col bg-neutral-50">
        <PortalTopBar />
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
    </div>
  );
}
