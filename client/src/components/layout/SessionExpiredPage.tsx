import { Link } from 'react-router';
import Logo from '../brand/Logo';
import { routes } from '../../config/site';

export default function SessionExpiredPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center gap-6 bg-neutral-100 px-4 py-10 md:justify-center md:gap-8">
      <Logo className="h-11 w-auto" />
      <div className="flex w-full max-w-110 flex-col gap-5 rounded-lg border border-neutral-300 bg-white p-6 md:p-10">
        <h1 className="type-h2">Your session has expired</h1>
        <p className="type-body text-neutral-600">
          Signed out for inactivity to keep customer data private.
        </p>
        <Link to={routes.staffLogin} className="type-label text-walnut underline">
          Go to staff login
        </Link>
      </div>
    </main>
  );
}
