import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../auth/AuthContext';
import Logo from '../brand/Logo';
import { Button, ErrorBanner } from '../ui';
import { routes } from '../../config/site';

export default function SessionExpiredPage() {
  const { session, loading, signOut } = useAuth();
  const [failed, setFailed] = useState(false);
  const signOutRef = useRef(signOut);
  const hasSession = session !== null;

  useEffect(() => {
    signOutRef.current = signOut;
  }, [signOut]);

  useEffect(() => {
    if (!hasSession) return;
    let cancelled = false;
    signOutRef.current().then((result) => {
      if (!cancelled && result === 'failed') setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [hasSession]);

  function retry() {
    setFailed(false);
    signOutRef.current().then((result) => {
      if (result === 'failed') setFailed(true);
    });
  }

  let action;
  if (failed && hasSession) {
    action = (
      <>
        <ErrorBanner message="We could not finish signing you out. Check your connection and try again." />
        <Button onClick={retry}>Retry</Button>
      </>
    );
  } else if (loading || hasSession) {
    action = (
      <p role="status" className="type-body text-neutral-600">
        Signing you out...
      </p>
    );
  } else {
    action = (
      <Link to={routes.staffLogin} className="type-label text-walnut underline">
        Go to staff login
      </Link>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center gap-6 bg-neutral-100 px-4 py-10 md:justify-center md:gap-8">
      <Logo className="h-11 w-auto" />
      <div className="flex w-full max-w-110 flex-col gap-5 rounded-lg border border-neutral-300 bg-white p-6 md:p-10">
        <h1 className="type-h2">Your session has expired</h1>
        <p className="type-body text-neutral-600">
          Signed out for inactivity to keep customer data private.
        </p>
        {action}
      </div>
    </main>
  );
}
