import { createApp } from '../server/src/app.js';
import { loadConfig } from '../server/src/config.js';
import { createAuthBackend, createSupabaseAdmin } from '../server/src/supabase.js';

const config = loadConfig();

// Allow requests from this exact Vercel deployment.
if (process.env.VERCEL_URL) {
  config.clientOrigins.push(`https://${process.env.VERCEL_URL}`);
}

const supabase = createSupabaseAdmin(config);

const app = createApp(config, createAuthBackend(config, supabase));

export default app;
