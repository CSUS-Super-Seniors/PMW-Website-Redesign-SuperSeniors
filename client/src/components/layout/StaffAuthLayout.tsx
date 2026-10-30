import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { routes } from '../../config/site';
import Logo from '../brand/Logo';

/**
 * Shared frame for the signed-out staff screens (Staff login, Forgot password,
 * Reset password): logo, white card, and a link back to the public site.
 */
export default function StaffAuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center gap-6 bg-neutral-100 px-4 py-10 md:justify-center md:gap-8">
      <Logo className="h-11 w-auto" />
      <div className="flex w-full max-w-110 flex-col gap-5 rounded-lg border border-neutral-300 bg-white p-6 md:p-10">
        {children}
      </div>
      <Link to={routes.home} className="type-label text-walnut underline">
        Back to the public site
      </Link>
    </main>
  );
}
