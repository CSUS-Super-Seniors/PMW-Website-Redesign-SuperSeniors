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

/** Milliseconds since the last activity in any tab. Garbage or future values count as expired. */
export function msSinceLastActivity(): number {
  try {
    const saved = localStorage.getItem(lastActivityKey);
    if (saved === null) return 0;
    const last = Number(saved);
    if (!Number.isFinite(last) || last > Date.now()) return Infinity;
    return Date.now() - last;
  } catch {
    return Date.now() - lastSeenInThisTab;
  }
}
