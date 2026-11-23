/** Inquiry links shared by the portal and server-generated owner emails. */
export const inquiryListPath = '/portal/inquiries';

export function inquiryDetailPath(id: string): string {
  return `${inquiryListPath}/${encodeURIComponent(id)}`;
}
