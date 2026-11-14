import { inquiryDetailPath, issueOptions, type EstimateStep1Data } from '@pmw/validation';
import type { SavedEstimate } from './estimateSubmission.js';
import { EmailDeliveryError } from './lib/emailDeliveryError.js';

type OwnerSummary = Pick<
  EstimateStep1Data,
  'first_name' | 'last_name' | 'item' | 'city' | 'issue_type'
>;

function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

const OWNER_ORIGIN_REQUIREMENT =
  'OWNER_PORTAL_ORIGIN must be an exact HTTPS origin; HTTP is allowed only for localhost, 127.0.0.1 or [::1].';

function ownerPortalUrl(origin: string | undefined): URL {
  try {
    if (!origin) throw new Error();
    const url = new URL(origin);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      url.origin !== origin ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))
    )
      throw new Error();
    return url;
  } catch {
    throw new EmailDeliveryError('not_configured', undefined, OWNER_ORIGIN_REQUIREMENT);
  }
}

/** Use only server configuration, never the request's Host or Origin headers. */
export function ownerInquiryUrl(origin: string | undefined, inquiryId: string): string {
  return `${ownerPortalUrl(origin).origin}${inquiryDetailPath(inquiryId)}`;
}

/** Warn once at startup without echoing a potentially secret configuration value. */
export function warnIfOwnerNoticeUnavailable(origin: string | undefined): void {
  try {
    ownerPortalUrl(origin);
  } catch {
    console.warn(`Owner estimate notices are unavailable: ${OWNER_ORIGIN_REQUIREMENT}`);
  }
}

/** N2 summary only. N9 (SSPMW-173) will provide the shared branded layout. */
export function buildOwnerNoticeEmail(
  saved: Pick<SavedEstimate, 'id' | 'inquiry_number'>,
  details: OwnerSummary,
  portalOrigin: string | undefined,
): { subject: string; text: string } {
  const link = ownerInquiryUrl(portalOrigin, saved.id);
  const issue = issueOptions.find((option) => option.value === details.issue_type)?.label;
  if (!issue) throw new Error('Owner notice issue is not recognized.');
  return {
    subject: `New estimate request: ${saved.inquiry_number}`,
    text: [
      'New estimate request',
      '',
      `Inquiry: ${saved.inquiry_number}`,
      `Customer: ${oneLine(`${details.first_name} ${details.last_name}`)}`,
      `Item: ${oneLine(details.item)}`,
      `City: ${oneLine(details.city)}`,
      `What happened: ${issue}`,
      '',
      'Open this inquiry in the owner portal:',
      link,
      '',
      'Owner login is required. Full request details and private photos are available in the portal.',
    ].join('\n'),
  };
}
