import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Creates the Supabase client the first time it is needed, so a missing env
 * variable only affects staff login and the portal, not the public site.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy client/.env.example to client/.env.',
    );
  }

  // The Reset password page reads the implicit-flow tokens from the link
  // (readResetLink in passwordReset.ts), so keep this flow if you change options.
  client = createClient(url, key, { auth: { flowType: 'implicit' } });
  return client;
}
