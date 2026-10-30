import { Link } from 'react-router';
import { routes } from '../config/site';

export default function NotFoundPage() {
  return (
    <main className="mx-auto flex w-full max-w-content flex-1 flex-col items-start justify-center px-4 py-20 xl:px-8">
      <p className="type-overline text-neutral-600">Error 404</p>

      <h1 className="type-h1 mt-2">Page not found</h1>

      <p className="type-body-lg mt-3 max-w-2xl text-neutral-600">
        Sorry, we couldn't find the page you're looking for. The link may be broken, or the page may
        have moved.
      </p>

      <Link
        to={routes.home}
        className="type-button mt-8 inline-flex min-h-11 items-center justify-center rounded-sm bg-dark-brown px-6 py-3 text-white transition-colors hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
      >
        Back to homepage
      </Link>
    </main>
  );
}
