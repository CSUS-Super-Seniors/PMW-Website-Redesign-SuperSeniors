import imageCompression from 'browser-image-compression';
import compressionWorkerUrl from 'browser-image-compression/dist/browser-image-compression.js?url';

// Sets upload limit to 1MiB
export const MAX_PHOTO_SIZE_BYTES = 1024 * 1024;

// Accepted file types (photos only)
type PhotoType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic';

async function detectPhotoType(file: File): Promise<PhotoType | undefined> {
  // MIME types and extensions are only hints. Inspect the container before
  // accepting a photo, including HEIC files reported as application/octet-stream.
  const bytes = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer());
  // Read only the file header to identify format
  const text = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));

  // recognizes jpeg
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  // recognizes png
  if (
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)
  ) {
    return 'image/png';
  }
  // recognizes webp
  if (
    text(0, 4) === 'RIFF' &&
    text(8, 12) === 'WEBP' &&
    ['VP8 ', 'VP8L', 'VP8X'].includes(text(12, 16))
  ) {
    return 'image/webp';
  }

  // HEIC/HEIF handling
  if (bytes.length >= 16 && text(4, 8) === 'ftyp') {
    const boxSize = new DataView(bytes.buffer).getUint32(0);
    // Inspect only the ftyp brands, never arbitrary strings in the file.
    if (boxSize >= 16 && boxSize <= file.size && boxSize % 4 === 0) {
      const brands: string[] = [];
      for (let offset = 8; offset + 4 <= Math.min(boxSize, bytes.length); offset += 4) {
        if (offset !== 12) brands.push(text(offset, offset + 4));
      }
      // AVIF also uses mif1. Leave it outside the supported phone-photo formats.
      if (brands.some((brand) => brand === 'avif' || brand === 'avis')) return;
      if (
        brands.some((brand) =>
          ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'].includes(
            brand,
          ),
        )
      ) {
        return 'image/heic';
      }
    }
  }
}

function jpegFilename(name: string): string {
  return `${name.replace(/\.[^.]*$/, '') || 'photo'}.jpg`;
}

/**
 * Compresses large photos before upload.
 * Images already within the size limit are returned unchanged.
 * This includes empty/generic MIME types: callers must account for storage's
 * MIME allowlist when uploading those unchanged files.
 */
export async function compressImage(file: File): Promise<File> {
  if (file.size === 0) {
    throw new Error('This image file is empty. Please choose another photo.');
  }

  let photoType: PhotoType | undefined;
  try {
    photoType = await detectPhotoType(file);
  } catch {
    throw new Error('This photo could not be read. Please choose another photo.');
  }
  if (!photoType) {
    throw new Error('Please choose a JPG, PNG, WebP, or HEIC/HEIF image file.');
  }

  // Preserve the original object, bytes, filename, and MIME type, even for HEIC.
  if (file.size <= MAX_PHOTO_SIZE_BYTES) {
    return file;
  }

  let source = file;
  if (photoType === 'image/heic') {
    try {
      const { heicTo } = await import('heic-to/csp');
      // libheif applies HEIF rotation/mirroring while decoding. The resulting
      // JPEG has upright pixels, so do not reapply the original orientation.
      const jpeg = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.9 });
      if (!jpeg.size) throw new Error('Empty HEIC conversion.');
      source = new File([jpeg], jpegFilename(file.name), {
        type: 'image/jpeg',
        lastModified: file.lastModified,
      });
    } catch {
      throw new Error(
        'This HEIC/HEIF photo could not be decoded. Please try another photo or export it as JPG.',
      );
    }
  } else if (file.type !== photoType) {
    source = new File([file], file.name, {
      type: photoType,
      lastModified: file.lastModified,
    });
  }

  let compressed: File;

  try {
    compressed = await imageCompression(source, {
      maxSizeMB: 1,
      maxWidthOrHeight: 1920,
      useWebWorker: true,
      libURL: compressionWorkerUrl,
    });
  } catch {
    throw new Error('This image could not be compressed. Please try a JPG, PNG, or WebP photo.');
  }

  if (compressed.size === 0) {
    throw new Error('This image could not be processed. Please choose another photo.');
  }

  if (compressed.size > MAX_PHOTO_SIZE_BYTES) {
    throw new Error('This image could not be reduced below 1 MB. Please choose a smaller photo.');
  }

  return new File([compressed], source.name, {
    type: compressed.type,
    lastModified: file.lastModified,
  });
}
