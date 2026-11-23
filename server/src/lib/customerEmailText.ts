import { domainToASCII } from 'node:url';
import { parse as parseHostname } from 'tldts';

function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

// Invisible characters: zero-width spaces, soft hyphens, variation selectors, the
// combining grapheme joiner and other format or default-ignorable characters.
const INVISIBLE = /[\p{Cf}\p{Default_Ignorable_Code_Point}]/gu;

/** What the customer sees: full-width letters folded (NFKC) and invisible characters dropped. */
function cleanText(value: string): string {
  return oneLine(value.normalize('NFKC').replace(INVISIBLE, ''));
}

// Things a mail app could turn into a link, checked against a copy of the text with
// combining marks removed, every kind of dash (and "~") turned into "-", and digits
// from any script turned into "0", so a combining mark after the dot, en dashes
// between digits and Arabic digits count too.
const LINK_PATTERNS = [
  /[a-z][a-z0-9+.-]*:\/\//i, // any scheme with "//", like http:// or ftp://
  /\b(?:tel|sms|smsto|mailto|callto|facetime|skype|whatsapp|javascript|vbscript|data|file):(?=\S)/i,
  /www\.|@/i, // "www." or an email address
  /(?:\d[\s().+\-/_\u00b7\u2022|*[\]]*){7,}/, // a phone number (7+ digits), which phones make tappable
];

/** Dot-separated words in any script, including the ideographic dots "。" and "｡". */
const HOSTNAME_LIKE = /[\p{L}\p{N}_-]+(?:[.\u3002\uff61][\p{L}\p{N}_-]+)+/gu;

/**
 * True when the text names a domain on a real top-level domain (spam.com, bit.ly,
 * пример.рф). "Mr.Smith" or "shelf.unit" end in something that isn't a TLD, so no
 * site can live there and mail apps don't link them. Every place the name could end
 * is checked, so "spam.com.2" or "spam.com.unit" still count.
 */
function containsDomain(text: string): boolean {
  for (const [match] of text.matchAll(HOSTNAME_LIKE)) {
    const labels = match.toLowerCase().split(/[.\u3002\uff61]/);
    for (let end = 2; end <= labels.length; end += 1) {
      // Ends in a number ("v1.2", "3.5"): not a domain. IP addresses count as phone numbers.
      if (/^\d+$/.test(labels[end - 1] ?? '')) continue;
      const ascii = domainToASCII(labels.slice(0, end).join('.'));
      // A name that can't be converted isn't trusted: treat it as a link.
      if (!ascii || parseHostname(ascii).isIcann) return true;
    }
  }
  return false;
}

function looksLikeLink(cleaned: string): boolean {
  const forCheck = cleaned
    .replace(/\p{M}/gu, '')
    .replace(/[\p{Pd}\u2212\u223c~]/gu, '-')
    .replace(/\p{Nd}/gu, '0');
  return LINK_PATTERNS.some((pattern) => pattern.test(forCheck)) || containsDomain(forCheck);
}

/**
 * The public form doesn't verify the email address, so a spammer could put someone
 * else's address on a request and a link in the name or item. Customer emails use
 * the business's domain, so customer text that looks like a link (or runs long) is
 * replaced with a plain word instead of being repeated. The text that is sent is the
 * same cleaned text that was checked.
 */
export function safeCustomerText(value: string, maxLength: number, fallback: string): string {
  const text = cleanText(value);
  if (!text || text.length > maxLength || looksLikeLink(text)) return fallback;
  return text;
}
