import type { Config } from './config.js';

export function withVercelOrigins(config: Config, env: NodeJS.ProcessEnv): Config {
  const hosts = [env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL];
  const origins = hosts
    .map((host) => host?.trim())
    .filter((host): host is string => Boolean(host))
    .map((host) => `https://${host}`);

  return {
    ...config,
    clientOrigins: [...new Set([...config.clientOrigins, ...origins])],
  };
}
