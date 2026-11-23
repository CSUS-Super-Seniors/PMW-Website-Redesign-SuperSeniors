import 'dotenv/config';
import { loadConfig } from '../src/config.js';
import { createSupabaseAdmin } from '../src/supabase.js';
import { cleanupEstimatePhotos } from '../src/lib/cleanupEstimatePhotos.js';

try {
  const result = await cleanupEstimatePhotos(
    createSupabaseAdmin(loadConfig()),
    process.argv.includes('--apply'),
  );
  console.log(
    `${result.applied ? 'Removed' : 'Dry run: eligible abandoned photos:'} ${result.count}`,
  );
} catch {
  console.error('Estimate photo cleanup failed. No credentials or visitor details were logged.');
  process.exitCode = 1;
}
