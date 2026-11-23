import { useCallback, useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router';

/** Protects an in-memory request until it is discarded or successfully submitted. */
export function useEstimateLeaveGuard(hasData: boolean) {
  const [submitted, setSubmitted] = useState(false);
  const submittedRef = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasData &&
      !submittedRef.current &&
      // Step changes and same-page anchors do not leave the request.
      currentLocation.pathname.replace(/\/+$/, '') !== nextLocation.pathname.replace(/\/+$/, ''),
  );

  useEffect(() => {
    if (!hasData || submitted || blocker.state === 'proceeding') return;

    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (submittedRef.current) return;
      event.preventDefault();
      event.returnValue = true;
    }

    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasData, submitted, blocker.state]);

  // SSPMW-53/70 call this only after the server confirms successful submission.
  // The ref allows navigation immediately, before React commits the state update.
  const markSubmitted = useCallback(() => {
    submittedRef.current = true;
    setSubmitted(true);
  }, []);

  const startNewRequest = useCallback(() => {
    submittedRef.current = false;
    setSubmitted(false);
  }, []);

  return { blocker, markSubmitted, startNewRequest };
}
