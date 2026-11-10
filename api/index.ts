import { createApp } from '../server/src/app.js';
import { loadConfig } from '../server/src/config.js';
import { createContactBackend } from '../server/src/contact.js';
import { createAuthBackend, createSupabaseAdmin } from '../server/src/supabase.js';
import { createInquiryBackend } from '../server/src/inquiries.js';
import { withVercelOrigins } from '../server/src/vercelOrigins.js';

const config = withVercelOrigins(loadConfig(), process.env);
const supabase = createSupabaseAdmin(config);
const contact = config.contactEmail
  ? createContactBackend(supabase, config.contactEmail)
  : undefined;

const app = createApp(
  config,
  createAuthBackend(config, supabase),
  contact,
  createInquiryBackend(supabase),
);

export default app;
