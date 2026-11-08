/** Largest estimate photo the server accepts, matching the 10 MB limit customers are shown. */
export const MAX_ESTIMATE_PHOTO_UPLOAD_BYTES = 10 * 1024 * 1024;

export type EstimatePhotoType = 'image/jpeg' | 'image/png';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Reads the file's first bytes. The file name and declared type are never trusted. */
export function detectImageType(bytes: Buffer): EstimatePhotoType | undefined {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg';
  if (bytes.length >= PNG_SIGNATURE.length && bytes.subarray(0, 8).equals(PNG_SIGNATURE))
    return 'image/png';
  return undefined;
}

export type EstimatePhotoCheck =
  | { ok: true; type: EstimatePhotoType; extension: 'jpg' | 'png' }
  | { ok: false; status: 400 | 413 | 415; error: string };

/**
 * Server-side check for an uploaded estimate photo: JPG or PNG by content, and no
 * larger than `maxBytes`. When the browser sent a Content-Type, it must agree with
 * the content, so a renamed file is refused either way.
 */
export function checkEstimatePhoto(
  bytes: unknown,
  declaredType?: string,
  maxBytes = MAX_ESTIMATE_PHOTO_UPLOAD_BYTES,
): EstimatePhotoCheck {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0)
    return { ok: false, status: 400, error: 'Choose a photo to upload.' };
  if (bytes.length > maxBytes)
    return {
      ok: false,
      status: 413,
      error: `Photos must be ${Math.floor(maxBytes / (1024 * 1024)) || 1} MB or smaller.`,
    };
  const type = detectImageType(bytes);
  const declared = declaredType?.split(';')[0]?.trim().toLowerCase();
  if (!type || (declared && declared !== type))
    return { ok: false, status: 415, error: 'Photos must be JPG or PNG images.' };
  return { ok: true, type, extension: type === 'image/jpeg' ? 'jpg' : 'png' };
}
