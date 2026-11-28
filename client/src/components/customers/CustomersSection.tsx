import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { Toast } from '../ui';
import { readAddedName } from './customerRoutes';

/**
 * Wraps every page under /portal/customers. It shows the "customer added" toast after
 * Add customer redirects back to the list, so the list page (K1) does not need to know
 * about it.
 */
export default function CustomersSection() {
  const location = useLocation();
  const navigate = useNavigate();
  const [addedName, setAddedName] = useState(() => readAddedName(location.state));
  const [seenState, setSeenState] = useState(location.state);

  // A second save while the toast is open replaces the message.
  if (location.state !== seenState) {
    setSeenState(location.state);
    const name = readAddedName(location.state);
    if (name) setAddedName(name);
  }

  function dismiss() {
    setAddedName(null);
    // Clear the history entry so going back or refreshing doesn't show the toast again.
    if (readAddedName(location.state)) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }

  return (
    <>
      <Outlet />
      {addedName && (
        <Toast message={`${addedName} was added to your customers.`} onDismiss={dismiss} />
      )}
    </>
  );
}
