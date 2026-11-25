import {
  PUBLIC_SERVICE_CITIES_PATH,
  RECENT_GALLERY_PATH,
  publicServiceCitiesSchema,
  recentGallerySchema,
} from '@pmw/validation';

async function readPublicContent(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(path, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('Public content could not be loaded.');
  return response.json();
}

export async function fetchPublicServiceCities(signal: AbortSignal) {
  return publicServiceCitiesSchema.parse(
    await readPublicContent(PUBLIC_SERVICE_CITIES_PATH, signal),
  );
}

export async function fetchRecentGallery(signal: AbortSignal) {
  return recentGallerySchema.parse(await readPublicContent(RECENT_GALLERY_PATH, signal));
}
