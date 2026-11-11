import { compressImage, detectPhotoType } from './compressImage';
import type { PhotoSession, UploadedEstimatePhoto } from '@pmw/validation';

// Original selection limit, separate from the compression helper's 1 MiB target.
export const MAX_ORIGINAL_PHOTO_BYTES = 10 * 1024 * 1024;

export interface PreparedEstimatePhoto {
  id: string;
  original: File;
  file: File;
  uploaded?: UploadedEstimatePhoto;
  uploadError?: string;
}

export interface EstimatePhotoHandoff {
  photoSession: PhotoSession | null;
  photos: UploadedEstimatePhoto[];
}

export type EstimatePhoto =
  | { id: string; original: File; status: 'processing' }
  | (PreparedEstimatePhoto & { status: 'ready' })
  | { id: string; original: File; status: 'error'; error: string };

export async function prepareEstimatePhoto(file: File): Promise<File> {
  if (file.size > MAX_ORIGINAL_PHOTO_BYTES) {
    throw new Error('This photo is too large. Choose a photo of 10 MB or less.');
  }
  if (file.size === 0) {
    throw new Error('This image file is empty. Please choose another photo.');
  }
  let type: Awaited<ReturnType<typeof detectPhotoType>>;
  try {
    type = await detectPhotoType(file);
  } catch {
    throw new Error('This photo could not be read. Choose another photo.');
  }
  if (type !== 'image/jpeg' && type !== 'image/png') throw new Error('Choose a JPG or PNG photo.');

  // Normalize browser MIME hints before compression and private upload.
  const source =
    file.type === type
      ? file
      : new File([file], file.name, { type, lastModified: file.lastModified });
  return compressImage(source);
}
