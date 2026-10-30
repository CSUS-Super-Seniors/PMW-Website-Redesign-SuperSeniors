import { createApp } from '../server/src/app.js';
import { loadConfig } from '../server/src/config.js';
import { createAuthBackend, createSupabaseAdmin } from '../server/src/supabase.js';
import { withVercelOrigins } from '../server/src/vercelOrigins.js';

const config = withVercelOrigins(loadConfig(), process.env);
const supabase = createSupabaseAdmin(config);

const app = createApp(config, createAuthBackend(config, supabase));

export default app;
