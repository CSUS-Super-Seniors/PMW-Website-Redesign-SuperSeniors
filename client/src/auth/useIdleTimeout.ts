import { useState, useEffect, useRef } from 'react';

const lastActivityKey = 'pmw:lastActivity';

function saveLastActivity() {
  try {
    localStorage.setItem(lastActivityKey, String(Date.now()));
  } catch {
    // Storage can be blocked (private mode); the timer still works without it
  }
}

function readLastActivity(): number | null {
  try {
    const saved = localStorage.getItem(lastActivityKey);
    return saved === null ? null : Number(saved);
  } catch {
    return null; // storage blocked: behave as if nothing was saved
  }
}

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

    saveLastActivity();

    const idleLimit = idleWarningMinutes * 60 * 1000;
    let id: ReturnType<typeof setTimeout>;

    function handleTimerFired() {
      const last = readLastActivity();
      const elapsed = last === null ? idleLimit : Date.now() - last;

      if (elapsed >= idleLimit) {
        setIsIdle(true);
      } else {
        id = setTimeout(handleTimerFired, idleLimit - elapsed);
      }
    }

    id = setTimeout(handleTimerFired, idleLimit);

    function restartTimer() {
      clearTimeout(id);
      id = setTimeout(handleTimerFired, idleLimit);
    }

    function handleActivity() {
      saveLastActivity();
      restartTimer();
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === lastActivityKey) {
        restartTimer();
      }
    }

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((name) => window.addEventListener(name, handleActivity));
    window.addEventListener('storage', handleStorage);

    return () => {
      clearTimeout(id);
      events.forEach((name) => window.removeEventListener(name, handleActivity));
      window.removeEventListener('storage', handleStorage);
    };
  }, [isIdle, idleWarningMinutes]);

  useEffect(() => {
    if (!isIdle) return;

    const id = setTimeout(
      () => {
        const last = readLastActivity();
        const idleLimit = idleWarningMinutes * 60 * 1000;
        const wasActiveRecently = last !== null && Date.now() - last < idleLimit;

        if (wasActiveRecently) {
          setIsIdle(false);
        } else {
          signOutRef.current();
        }
      },
      idleWarningDurationMinutes * 60 * 1000,
    );

    return () => clearTimeout(id);
  }, [isIdle, idleWarningDurationMinutes, idleWarningMinutes]);

  function stayLoggedIn() {
    setIsIdle(false);
  }
  return { isIdle, stayLoggedIn };
}
