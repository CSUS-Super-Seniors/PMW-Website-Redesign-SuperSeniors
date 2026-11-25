import { z } from 'zod';

export const PUBLIC_SERVICE_CITIES_PATH = '/api/public/service-cities';
export const RECENT_GALLERY_PATH = '/api/public/gallery/recent';
export const HOME_RECENT_WORK_LIMIT = 3;

const publicImageUrl = z.url({ protocol: /^https?$/ });

export const publicServiceCitiesSchema = z.object({
  cities: z.array(z.string().trim().min(1).max(100)),
});

export const recentGallerySchema = z.object({
  items: z
    .array(
      z.object({
        id: z.uuid(),
        beforeUrl: publicImageUrl.nullable(),
        afterUrl: publicImageUrl.nullable(),
      }),
    )
    .max(HOME_RECENT_WORK_LIMIT),
});

export type PublicServiceCities = z.infer<typeof publicServiceCitiesSchema>;
export type RecentGallery = z.infer<typeof recentGallerySchema>;
export type RecentGalleryItem = RecentGallery['items'][number];
