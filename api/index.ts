import { createEstimatePhotosBackend } from '../server/src/estimatePhotos.js';
import { createApp } from '../server/src/app.js';
import { loadConfig } from '../server/src/config.js';
import { createContactBackend } from '../server/src/contact.js';
import { createServiceAreaBackend } from '../server/src/serviceArea.js';
import { createAuthBackend, createSupabaseAdmin } from '../server/src/supabase.js';
import { createInquiryBackend } from '../server/src/inquiries.js';
import { withVercelOrigins } from '../server/src/vercelOrigins.js';

// Vercel puts one proxy in front of the function and sets X-Forwarded-For itself.
const config = withVercelOrigins(
  loadConfig({ ...process.env, TRUST_PROXY_HOPS: process.env.TRUST_PROXY_HOPS?.trim() || '1' }),
  process.env,
);
const supabase = createSupabaseAdmin(config);
const contact = config.contactEmail
  ? createContactBackend(supabase, config.contactEmail)
  : undefined;

const app = createApp(config, createAuthBackend(config, supabase), contact, {
  serviceArea: createServiceAreaBackend(supabase),
  photos: createEstimatePhotosBackend(supabase, config.supabaseServiceRoleKey),
  inquiries: createInquiryBackend(supabase),
});

export default app;
