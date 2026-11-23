import type { SupabaseClient } from '@supabase/supabase-js';
import { PHOTO_BUCKET } from '@pmw/validation';

/** Run daily. Default is dry-run; never deletes attached or still-claimable files. */
export async function cleanupEstimatePhotos(
  client: SupabaseClient,
  apply = false,
  now = Date.now(),
) {
  const bucket = client.storage.from(PHOTO_BUCKET);
  const cutoff = Math.floor(now / 1000) - 24 * 60 * 60;
  const candidates: string[] = [];
  async function list(prefix: string) {
    const all: { name: string; id: string | null }[] = [];
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await bucket.list(prefix, {
        limit: 100,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error || !data) throw new Error('Could not list expired photo uploads.');
      all.push(...data);
      if (data.length < 100) return all;
    }
  }
  for (const folder of await list('estimate-uploads')) {
    if (!/^\d+$/.test(folder.name) || Number(folder.name) >= cutoff || folder.id) continue;
    const prefix = `estimate-uploads/${folder.name}`;
    for (const owner of await list(prefix)) {
      if (owner.id) continue;
      for (const file of await list(`${prefix}/${owner.name}`)) {
        if (!file.id) continue;
        const path = `${prefix}/${owner.name}/${file.name}`;
        const { data, error } = await client
          .from('inquiry_photos')
          .select('id')
          .eq('storage_path', path)
          .maybeSingle();
        if (error) throw new Error('Could not verify photo attachments. Cleanup stopped.');
        if (!data) candidates.push(path);
      }
    }
  }
  // Discovery finishes before deletion so offsets cannot skip objects.
  if (apply)
    for (const path of candidates) {
      const { error } = await bucket.remove([path]);
      if (error) throw new Error('Could not remove an abandoned photo.');
    }
  return { count: candidates.length, applied: apply };
}
