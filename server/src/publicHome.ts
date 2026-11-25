import type { SupabaseClient } from '@supabase/supabase-js';
import { recentGallerySchema, type RecentGallery } from '@pmw/validation';

export interface PublicHomeBackend {
  listServiceCities(): Promise<string[]>;
  recentWork(): Promise<RecentGallery['items']>;
}

const PUBLIC_PHOTO_PATH =
  /^media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|avif)$/;

/** Uses only public-copy metadata. Jobs, customers and private paths are never read. */
export function createPublicHomeBackend(
  client: Pick<SupabaseClient, 'from' | 'rpc' | 'storage'>,
): PublicHomeBackend {
  function publicUrl(path: unknown): string | null {
    if (path === null) return null;
    if (typeof path !== 'string' || !PUBLIC_PHOTO_PATH.test(path)) {
      throw new Error('Invalid public gallery path.');
    }
    return client.storage.from('gallery').getPublicUrl(path).data.publicUrl;
  }

  return {
    async listServiceCities() {
      const { data, error } = await client
        .from('service_cities')
        .select('name')
        .eq('is_active', true)
        .order('name');
      if (error || !Array.isArray(data)) throw new Error('Service cities could not be loaded.');
      return data.map((row: { name: string }) => row.name);
    },
    async recentWork() {
      const { data, error } = await client.rpc('recent_gallery_work');
      if (error || !Array.isArray(data)) throw new Error('Recent work could not be loaded.');
      // The RPC returns one row per job, already ordered and limited. Project fields
      // explicitly so even unexpected database fields cannot reach a public response.
      return recentGallerySchema.parse({
        items: data.map((row) => ({
          id: row.id,
          beforeUrl: publicUrl(row.before_path),
          afterUrl: publicUrl(row.after_path),
        })),
      }).items;
    },
  };
}
