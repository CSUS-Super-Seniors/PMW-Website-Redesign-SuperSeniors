import { inquiryDetailPath, issueOptions, type EstimateStep1Data } from '@pmw/validation';
import type { SavedEstimate } from './estimateSubmission.js';

type OwnerSummary = Pick<
  EstimateStep1Data,
  'first_name' | 'last_name' | 'item' | 'city' | 'issue_type'
>;

function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Use only server configuration, never the request's Host or Origin headers. */
export function ownerInquiryUrl(origin: string | undefined, inquiryId: string): string {
  try {
    if (!origin) throw new Error();
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) throw new Error();
    return `${url.origin}${inquiryDetailPath(inquiryId)}`;
  } catch {
    throw new Error('OWNER_PORTAL_ORIGIN must be an exact HTTP(S) origin.');
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
