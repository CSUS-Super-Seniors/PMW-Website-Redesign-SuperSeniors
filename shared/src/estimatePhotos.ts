import { z } from 'zod';

export const MAX_ESTIMATE_PHOTO_BYTES = 1024 * 1024;
export const PHOTO_BUCKET = 'inquiry photos';
export const photoSessionSchema = z.object({
  token: z.string().min(1).max(2048),
  expiresAt: z.number().int().positive(),
});
export const uploadedEstimatePhotoSchema = z.object({
  id: z.uuid(),
  storagePath: z.string().min(1).max(300),
  receipt: z.string().min(1).max(2048),
});
export type PhotoSession = z.infer<typeof photoSessionSchema>;
export type UploadedEstimatePhoto = z.infer<typeof uploadedEstimatePhotoSchema>;
