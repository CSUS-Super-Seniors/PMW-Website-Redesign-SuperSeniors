export interface ContactEmailConfig {
  apiKey: string;
  from: string;
  to: string[];
}

export interface Config {
  port: number;
  clientOrigins: string[];
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  contactEmail?: ContactEmailConfig;
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
  return {
    port,
    clientOrigins,
    supabaseUrl,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
    contactEmail,
  };
}
