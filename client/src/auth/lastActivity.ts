export const lastActivityKey = 'pmw:lastActivity';

// Used when localStorage is blocked, so the timer still works in this tab.
let lastSeenInThisTab = Date.now();

export function saveLastActivity() {
  lastSeenInThisTab = Date.now();
  try {
    localStorage.setItem(lastActivityKey, String(lastSeenInThisTab));
  } catch {
    // Storage can be blocked (private mode); the in-memory time still works
  }
}

/** Saves "now" only when nothing is saved yet, so a reload never erases an old time. */
export function ensureLastActivity() {
  let missing = true;
  try {
    missing = localStorage.getItem(lastActivityKey) === null;
  } catch {
    // blocked: fall through and use the in-memory time
  }
  if (missing) saveLastActivity();
}

/** Milliseconds since the last activity in any tab. A non-number counts as expired; a future time restarts from now. */
export function msSinceLastActivity(): number {
  try {
    const saved = localStorage.getItem(lastActivityKey);
    if (saved === null) return 0;
    const last = Number(saved);
    if (!Number.isFinite(last)) return Infinity;
    if (last > Date.now()) {
      // A clock correction put the time in the future. Restart from now (writing it once
      // means it can't stay "in the future" forever and stop the session from ever timing out).
      saveLastActivity();
      return 0;
    }
    return Date.now() - last;
  } catch {
    return Date.now() - lastSeenInThisTab;
  }
}

/** Forgets the saved time. A missing time counts as "just now", so the next session starts fresh. */
export function clearLastActivity() {
  lastSeenInThisTab = Date.now();
  try {
    localStorage.removeItem(lastActivityKey);
  } catch {
    // blocked: nothing saved to remove
  }
}
