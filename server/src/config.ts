export interface ContactEmailConfig {
  apiKey: string;
  from: string;
  to: string[];
}

export interface RateLimitConfig {
  max: number;
  windowMs: number;
}

export interface Config {
  port: number;
  clientOrigins: string[];
  /** Proxies in front of the app whose X-Forwarded-For can be trusted (Vercel: 1). */
  trustProxyHops: number;
  /** Estimate submissions allowed per visitor IP in one window. */
  estimateRateLimit: RateLimitConfig;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  contactEmail?: ContactEmailConfig;
}
function wholeNumberSetting(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || value < min || value > max)
    throw new Error(`${key} must be a whole number from ${min} to ${max}`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const required = ['CLIENT_ORIGINS', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter((key) => !env[key]?.trim());
  if (missing.length)
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be an integer between 1 and 65535');
  const clientOrigins = env.CLIENT_ORIGINS!.split(',').map((value) => value.trim());
  for (const origin of clientOrigins) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error('CLIENT_ORIGINS must contain comma-separated HTTP(S) origins');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin)
      throw new Error(
        'CLIENT_ORIGINS must contain exact HTTP(S) origins without paths or trailing slashes',
      );
  }
  const supabaseUrl = env.SUPABASE_URL!.trim();
  try {
    if (!['http:', 'https:'].includes(new URL(supabaseUrl).protocol)) throw new Error();
  } catch {
    throw new Error('SUPABASE_URL must be an HTTP(S) URL');
  }
  const emailKeys = ['RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'CONTACT_OWNER_EMAILS'] as const;
  let contactEmail: ContactEmailConfig | undefined;
  if (emailKeys.some((key) => env[key]?.trim())) {
    const missingEmail = emailKeys.filter((key) => !env[key]?.trim());
    if (missingEmail.length) {
      throw new Error(`Missing contact email environment variables: ${missingEmail.join(', ')}`);
    }
    const from = env.RESEND_FROM_EMAIL!.trim();
    const to = env
      .CONTACT_OWNER_EMAILS!.split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const mailbox = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
    if (
      to.length === 0 ||
      to.length > 50 ||
      ![from, ...to].every((value) => value.length <= 254 && mailbox.test(value))
    ) {
      throw new Error(
        'RESEND_FROM_EMAIL and CONTACT_OWNER_EMAILS must contain bare email addresses',
      );
    }
    contactEmail = { apiKey: env.RESEND_API_KEY!.trim(), from, to: [...new Set(to)] };
  }
  const trustProxyHops = wholeNumberSetting(env, 'TRUST_PROXY_HOPS', 0, 0, 10);
  const estimateRateLimit = {
    max: wholeNumberSetting(env, 'ESTIMATE_RATE_LIMIT_MAX', 5, 1, 1000),
    windowMs: wholeNumberSetting(env, 'ESTIMATE_RATE_LIMIT_WINDOW_MINUTES', 60, 1, 1440) * 60_000,
  };
  return {
    port,
    clientOrigins,
    trustProxyHops,
    estimateRateLimit,
    supabaseUrl,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
    contactEmail,
  };
}
