export interface Config { port: number; clientOrigins: string[]; supabaseUrl: string; supabaseServiceRoleKey: string }
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const required = ['CLIENT_ORIGINS', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter(key => !env[key]?.trim());
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  const port = Number(env.PORT ?? 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535');
  const clientOrigins = env.CLIENT_ORIGINS!.split(',').map(value => value.trim());
  for (const origin of clientOrigins) {
    let url: URL;
    try { url = new URL(origin); } catch { throw new Error('CLIENT_ORIGINS must contain comma-separated HTTP(S) origins'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) throw new Error('CLIENT_ORIGINS must contain exact HTTP(S) origins without paths or trailing slashes');
  }
  const supabaseUrl = env.SUPABASE_URL!.trim();
  try { if (!['http:', 'https:'].includes(new URL(supabaseUrl).protocol)) throw new Error(); }
  catch { throw new Error('SUPABASE_URL must be an HTTP(S) URL'); }
  return { port, clientOrigins, supabaseUrl, supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY!.trim() };
}
