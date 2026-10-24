import { useState, useEffect, useRef } from 'react';

export function useIdleTimeout(
  signOut: () => Promise<void>,
  idleWarningMinutes: number,
  idleWarningDurationMinutes: number,
) {
  const [isIdle, setIsIdle] = useState<boolean>(false);
  const signOutRef = useRef(signOut);

  useEffect(() => {
    signOutRef.current = signOut;
  }, [signOut]);

  useEffect(() => {
    if (isIdle) return;

    let id = setTimeout(
      () => {
        setIsIdle(true);
      },
      idleWarningMinutes * 60 * 1000,
    );

    function resetTimer() {
      clearTimeout(id);
      id = setTimeout(
        () => {
          setIsIdle(true);
        },
        idleWarningMinutes * 60 * 1000,
      );
    }

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((name) => window.addEventListener(name, resetTimer));

    return () => {
      clearTimeout(id);
      events.forEach((name) => window.removeEventListener(name, resetTimer));
    };
  }, [isIdle, idleWarningMinutes]);

  useEffect(() => {
    if (!isIdle) return;

    const id = setTimeout(
      () => {
        signOutRef.current();
      },
      idleWarningDurationMinutes * 60 * 1000,
    );

    return () => clearTimeout(id);
  }, [isIdle, idleWarningDurationMinutes]);

  function stayLoggedIn() {
    setIsIdle(false);
  }
  return { isIdle, stayLoggedIn };
}
