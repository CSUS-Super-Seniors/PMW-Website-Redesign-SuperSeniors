import { Outlet } from 'react-router';
import PublicFooter from './PublicFooter';
import PublicHeader from './PublicHeader';

/** Wraps every public page with the shared header and footer (SSPMW-132). */
export default function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="type-button sr-only rounded-sm bg-dark-brown px-4 py-3 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to main content
      </a>
      <PublicHeader />
      <div id="main" className="flex flex-1 flex-col">
        <Outlet />
      </div>
      <PublicFooter />
    </div>
  );
}
