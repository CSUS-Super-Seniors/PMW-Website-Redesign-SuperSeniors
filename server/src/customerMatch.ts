// Email and phone are the two ways we recognise a returning customer.
// These helpers are pure functions so they are easy to test on their own.

export function normalizeEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase();
  return email ? email : null;
}

// Keeps digits only, and drops a leading US country code "1".
// "(916) 555-0142" and "+1 916-555-0142" both become "9165550142".
export function normalizePhone(value: string | null | undefined): string | null {
  const digits = (value ?? '').replace(/\D/g, '');
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  // Anything shorter than a full number is too weak to match a person on.
  return national.length === 10 ? national : null;
}

export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const first = normalizePhone(a);
  const second = normalizePhone(b);
  return first !== null && first === second;
}

// The database can't compare digits only, so we narrow candidates by the last four
// digits first, then confirm with phonesMatch in code.
export function phoneLookupTail(value: string | null | undefined): string | null {
  const phone = normalizePhone(value);
  return phone ? phone.slice(-4) : null;
}

// ilike treats % and _ as wildcards and \ as the escape character.
// Escape them so an email like "a_b@x.com" only matches itself.
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
