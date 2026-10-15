import 'dotenv/config';
import { loadConfig } from './config.js';
import { createAuthBackend } from './supabase.js';
import { createApp } from './app.js';
try {
  const config = loadConfig();
  const server = createApp(config, createAuthBackend(config)).listen(config.port, '0.0.0.0', () => {
    console.log(`API listening on port ${config.port}`);
  });
  server.on('error', () => { console.error('Unable to start API listener'); process.exitCode = 1; });
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => { server.close(() => process.exit(0)); });
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Unable to start API');
  process.exitCode = 1;
}
