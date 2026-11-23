import { z } from 'zod';

// Shared by public inquiries, manual jobs (H2), and lead source reporting (M2).
// Persist the value; use the label for customer-facing text.
export const leadSourceOptions = [
  { value: 'google', label: 'Google' },
  { value: 'referral', label: 'Referral' },
  { value: 'social_media', label: 'Social media' },
  { value: 'yelp', label: 'Yelp' },
  { value: 'other', label: 'Other' },
] as const;

export const leadSourceSchema = z.enum(
  leadSourceOptions.map((option) => option.value),
  { error: 'Select how you heard about us from the list.' },
);

export type LeadSource = z.infer<typeof leadSourceSchema>;
