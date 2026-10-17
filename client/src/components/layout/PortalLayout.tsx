import { Outlet } from 'react-router';
import PortalSidebar from './PortalSidebar';
import PortalTopBar from './PortalTopBar';

export default function PortalLayout() {
  return (
    <div className="flex min-h-dvh">
      <PortalSidebar />
      <div className="flex flex-1 flex-col bg-neutral-50">
        <PortalTopBar />
        <div className="flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
