const monthNames = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * "2026-09-24" becomes "Sep 24, 2026" (Figma customer list). Read from the
 * text, not a Date, so the day never shifts with the browser's time zone.
 */
export function formatLastJobDate(value: string | null): string {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) return 'No jobs yet';
  const [, year, month, day] = match;
  return `${monthNames[Number(month) - 1]} ${Number(day)}, ${year}`;
}

/** A complete YYYY-MM-DD date from a date input, as the API accepts it. */
export function isCompleteDate(value: string): boolean {
  return /^[1-9]\d{3}-\d{2}-\d{2}$/.test(value);
}

/** "1 customer", "128 customers". */
export function customerCount(total: number): string {
  return `${total} ${total === 1 ? 'customer' : 'customers'}`;
}
