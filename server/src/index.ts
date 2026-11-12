import 'dotenv/config';
import { loadConfig } from './config.js';
import { createAuthBackend, createSupabaseAdmin } from './supabase.js';
import { createApp } from './app.js';
import { createContactBackend } from './contact.js';
import { createServiceAreaBackend } from './serviceArea.js';
import { createEstimatePhotosBackend } from './estimatePhotos.js';
import {
  createEstimateSubmissionBackend,
  createEstimateSubmitHandler,
} from './estimateSubmission.js';
try {
  const config = loadConfig();
  const supabase = createSupabaseAdmin(config);
  const contact = config.contactEmail
    ? createContactBackend(supabase, config.contactEmail)
    : undefined;
  if (!contact) {
    console.warn(
      'Contact messaging is unavailable: configure the contact email environment variables.',
    );
  }
  const photos = createEstimatePhotosBackend(supabase, config.supabaseServiceRoleKey);
  const server = createApp(config, createAuthBackend(config, supabase), contact, {
    serviceArea: createServiceAreaBackend(supabase),
    photos,
    estimateSubmit: createEstimateSubmitHandler(
      createEstimateSubmissionBackend(supabase, config.contactEmail),
      photos,
    ),
  }).listen(config.port, '0.0.0.0', () => {
    console.log(`API listening on port ${config.port}`);
  });
  server.on('error', () => {
    console.error('Unable to start API listener');
    process.exitCode = 1;
  });
  for (const signal of ['SIGTERM', 'SIGINT'] as const)
    process.on(signal, () => {
      server.close(() => process.exit(0));
    });
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Unable to start API');
  process.exitCode = 1;
}
