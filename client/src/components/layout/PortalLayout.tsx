import { Outlet } from 'react-router';
import PortalSidebar from './PortalSidebar';
import PortalTopBar from './PortalTopBar';
import PortalBottomNav from './PortalBottomNav';

export default function PortalLayout() {
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
    </div>
  );
}
