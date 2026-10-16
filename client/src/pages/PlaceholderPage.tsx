import { Link } from 'react-router';
import { routes } from '../config/site';

/** Temporary page for routes that are not built yet (epic C pages, staff login, 404). */
export default function PlaceholderPage() {
  return (
    <main className="mx-auto w-full max-w-content px-4 py-20 xl:px-8">
      <p className="type-overline text-neutral-600">Coming soon</p>
      <h1 className="type-h1 mt-2">This page is not built yet</h1>
      <p className="type-body-lg mt-3 text-neutral-600">
        Head back to the{' '}
        <Link to={routes.home} className="text-walnut underline">
          home page
        </Link>
        .
      </p>
    </main>
  );
}
