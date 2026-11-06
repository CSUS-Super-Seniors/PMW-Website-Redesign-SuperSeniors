import { compressImage } from './compressImage';
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

function readHeader(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(new Error('This photo could not be read. Choose another photo.'));
    reader.readAsArrayBuffer(file.slice(0, 8));
  });
}

export async function prepareEstimatePhoto(file: File): Promise<File> {
  if (file.size > MAX_ORIGINAL_PHOTO_BYTES) {
    throw new Error('This photo is too large. Choose a photo of 10 MB or less.');
  }
  if (file.size === 0) {
    throw new Error('This image file is empty. Please choose another photo.');
  }
  const bytes = await readHeader(file);
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
    (byte, index) => bytes[index] === byte,
  );
  if (!jpeg && !png) throw new Error('Choose a JPG or PNG photo.');

  // Normalize generic/incorrect browser MIME hints for storage integration later.
  const type = jpeg ? 'image/jpeg' : 'image/png';
  const source =
    file.type === type
      ? file
      : new File([file], file.name, { type, lastModified: file.lastModified });
  return compressImage(source);
}
