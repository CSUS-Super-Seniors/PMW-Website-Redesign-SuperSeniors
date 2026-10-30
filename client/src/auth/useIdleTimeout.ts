import { useEffect, useRef, useState } from 'react';
import {
  ensureLastActivity,
  lastActivityKey,
  msSinceLastActivity,
  saveLastActivity,
} from './lastActivity';

export function useIdleTimeout(
  onTimeout: () => void,
  idleWarningMinutes: number,
  idleWarningDurationMinutes: number,
) {
  const [isIdle, setIsIdle] = useState(false);
  const onTimeoutRef = useRef(onTimeout);
  const idleLimit = idleWarningMinutes * 60 * 1000;
  const totalLimit = idleLimit + idleWarningDurationMinutes * 60 * 1000;

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  // Phase 1: waiting for the person to go idle. Every wake-up re-reads the saved time.
  useEffect(() => {
    if (isIdle) return;
    let id: ReturnType<typeof setTimeout>;

    function check() {
      clearTimeout(id);
      const idleFor = msSinceLastActivity();
      if (idleFor >= totalLimit) onTimeoutRef.current();
      else if (idleFor >= idleLimit) setIsIdle(true);
      else id = setTimeout(check, idleLimit - idleFor);
    }
    function handleActivity() {
      if (msSinceLastActivity() < idleLimit) saveLastActivity();
      check();
    }
    function handleStorage(event: StorageEvent) {
      if (event.key === lastActivityKey) check();
    }
    function handleVisible() {
      if (document.visibilityState === 'visible') check();
    }

    const events = ['mousedown', 'keydown', 'touchstart', 'wheel'];
    events.forEach((name) => window.addEventListener(name, handleActivity, { passive: true }));
    window.addEventListener('scroll', handleActivity, { capture: true, passive: true });
    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', handleVisible);

    ensureLastActivity();
    check();

    return () => {
      clearTimeout(id);
      events.forEach((name) => window.removeEventListener(name, handleActivity));
      window.removeEventListener('scroll', handleActivity, { capture: true });
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [isIdle, idleLimit, totalLimit]);

  // Phase 2: the warning is open. Leave when the time is up, or close it if another tab is active.
  useEffect(() => {
    if (!isIdle) return;
    let id: ReturnType<typeof setTimeout>;

    function finish() {
      clearTimeout(id);
      const idleFor = msSinceLastActivity();
      if (idleFor < idleLimit) setIsIdle(false);
      else if (idleFor >= totalLimit) onTimeoutRef.current();
      else id = setTimeout(finish, totalLimit - idleFor);
    }
    function handleStorage(event: StorageEvent) {
      if (event.key === lastActivityKey) finish();
    }
    function handleVisible() {
      if (document.visibilityState === 'visible') finish();
    }

    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', finish);
    document.addEventListener('visibilitychange', handleVisible);
    finish();

    return () => {
      clearTimeout(id);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', finish);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [isIdle, idleLimit, totalLimit]);

  function stayLoggedIn() {
    // The × button, Escape and the backdrop all end up here too, so check before saving.
    if (msSinceLastActivity() >= totalLimit) {
      onTimeoutRef.current();
      return;
    }
    saveLastActivity();
    setIsIdle(false);
  }

  return { isIdle, stayLoggedIn };
}
