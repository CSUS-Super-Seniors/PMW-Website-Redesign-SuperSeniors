import { Outlet } from 'react-router';
import PortalSidebar from './PortalSidebar';

export default function PortalLayout() {
  return (
    <div className="flex min-h-dvh">
      <PortalSidebar />
      <main className="flex-1 bg-neutral-50">
        <Outlet />
      </main>
    </div>
  );
}
