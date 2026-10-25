import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import imageCompression from 'browser-image-compression';
import { heicTo } from 'heic-to/csp';
import { compressImage, MAX_PHOTO_SIZE_BYTES } from './compressImage';

vi.mock('browser-image-compression', () => ({ default: vi.fn() }));
vi.mock('heic-to/csp', () => ({ heicTo: vi.fn() }));

// jsdom's Blob lacks arrayBuffer(). Read its actual bytes with FileReader;
// keep this compatibility shim local to this suite and restore it afterwards.
const arrayBufferDescriptor = Object.getOwnPropertyDescriptor(Blob.prototype, 'arrayBuffer');
beforeAll(() => {
  if (!arrayBufferDescriptor) {
    Object.defineProperty(Blob.prototype, 'arrayBuffer', {
      configurable: true,
      value(this: Blob): Promise<ArrayBuffer> {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = () => reject(reader.error);
          reader.readAsArrayBuffer(this);
        });
      },
    });
  }
});
afterAll(() => {
  if (!arrayBufferDescriptor) Reflect.deleteProperty(Blob.prototype, 'arrayBuffer');
});

const signatures = {
  jpeg: [0xff, 0xd8, 0xff, 0xe0],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  webp: Array.from('RIFF\x18\0\0\0WEBPVP8 ', (character) => character.charCodeAt(0)),
  // 24-byte ISO BMFF ftyp box: major brand, minor version, compatible brands.
  heic: [0, 0, 0, 24, ...ascii('ftypheic'), 0, 0, 0, 0, ...ascii('mif1heic')],
  heif: [0, 0, 0, 24, ...ascii('ftypmif1'), 0, 0, 0, 0, ...ascii('mif1heix')],
};

function ascii(text: string): number[] {
  return Array.from(text, (character) => character.charCodeAt(0));
}

// Header fixtures exercise format detection, not codec decoding. Codec behavior
// is mocked here; actual compression is verified separately in the browser.
function photo(
  format: keyof typeof signatures,
  size = 256,
  name = `photo.${format}`,
  type = `image/${format}`,
): File {
  const bytes = new Uint8Array(size);
  bytes.set(signatures[format]);
  return new File([bytes], name, { type, lastModified: 123456789 });
}

function expectNoProcessing() {
  expect(imageCompression).not.toHaveBeenCalled();
  expect(heicTo).not.toHaveBeenCalled();
}

describe('compressImage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns a nonempty File within 1,048,576 bytes for a 10 MB input using the compressor result', async () => {
    const input = photo('jpeg', 10 * 1024 * 1024);
    const compressed = photo('jpeg', 512 * 1024);
    vi.mocked(imageCompression).mockResolvedValue(compressed);

    const result = await compressImage(input);

    expect(input.size).toBe(10 * 1024 * 1024);
    expect(MAX_PHOTO_SIZE_BYTES).toBe(1_048_576);
    expect(result).toBeInstanceOf(File);
    expect(result.size).toBeGreaterThan(0);
    expect(result.size).toBeLessThanOrEqual(1_048_576);
    expect(await result.arrayBuffer()).toEqual(await compressed.arrayBuffer());
    expect(result.name).toBe(input.name);
    expect(result.type).toBe('image/jpeg');
    expect(result.lastModified).toBe(input.lastModified);
    expect(imageCompression).toHaveBeenCalledTimes(1);
    expect(vi.mocked(imageCompression).mock.calls[0][0]).toBe(input);
    expect(imageCompression).toHaveBeenCalledWith(input, expect.objectContaining({ maxSizeMB: 1 }));
    expect(heicTo).not.toHaveBeenCalled();
  });

  it.each(['jpeg', 'png', 'webp'] as const)(
    'returns the exact original small %s File unchanged',
    async (format) => {
      const input = photo(format);

      expect(await compressImage(input)).toBe(input);
      expectNoProcessing();
    },
  );

  it.each(['jpeg', 'png', 'webp'] as const)(
    'returns a %s image at exactly the size limit unchanged',
    async (format) => {
      const input = photo(format, 1_048_576);

      expect(await compressImage(input)).toBe(input);
      expectNoProcessing();
    },
  );

  it.each([
    ['notes.txt', 'text/plain'],
    ['notes.txt', 'image/jpeg'],
    ['photo.png', 'text/plain'],
    ['photo.webp', 'image/webp'],
    ['photo.heic', 'image/heic'],
    ['photo.heif', 'application/octet-stream'],
  ])('rejects non-image bytes named %s with MIME type %s', async (name, type) => {
    const input = new File(['This is text, not an image.'], name, { type });

    await expect(compressImage(input)).rejects.toThrow(
      'Please choose a JPG, PNG, WebP, or HEIC/HEIF image file.',
    );
    expectNoProcessing();
  });

  it('rejects an empty file with a readable error', async () => {
    await expect(compressImage(new File([], 'empty.jpg', { type: 'image/jpeg' }))).rejects.toThrow(
      'This image file is empty. Please choose another photo.',
    );
    expectNoProcessing();
  });

  it.each([
    ['heic', ''],
    ['heic', 'application/octet-stream'],
    ['heif', ''],
    ['heif', 'application/octet-stream'],
  ] as const)('preserves a small %s file with MIME type "%s"', async (format, type) => {
    const input = photo(format, 256, `phone.${format}`, type);

    expect(await compressImage(input)).toBe(input);
    expectNoProcessing();
  });

  it.each(['heic', 'heif'] as const)(
    'converts a large %s photo to JPEG before passing it to compression',
    async (format) => {
      const input = photo(format, MAX_PHOTO_SIZE_BYTES + 1, `phone.holiday.${format}`, '');
      const converted = photo('jpeg', 2 * MAX_PHOTO_SIZE_BYTES);
      const compressed = photo('jpeg', 1024);
      vi.mocked(heicTo).mockResolvedValue(converted);
      vi.mocked(imageCompression).mockImplementation(async (source) => {
        // Observing the converted bytes at this boundary verifies ordering too.
        expect(source).toBeInstanceOf(File);
        expect(source.name).toBe('phone.holiday.jpg');
        expect(source.type).toBe('image/jpeg');
        expect(await source.arrayBuffer()).toEqual(await converted.arrayBuffer());
        return compressed;
      });

      const result = await compressImage(input);

      expect(heicTo).toHaveBeenCalledTimes(1);
      expect(heicTo).toHaveBeenCalledWith(
        expect.objectContaining({ blob: input, type: 'image/jpeg' }),
      );
      expect(imageCompression).toHaveBeenCalledTimes(1);
      expect(result.name).toBe('phone.holiday.jpg');
      expect(result.type).toBe('image/jpeg');
      expect(result.lastModified).toBe(input.lastModified);
      expect(result.size).toBe(compressed.size);
    },
  );

  it.each(['rejection', 'empty output'] as const)(
    'reports a readable conversion error for %s without compressing',
    async (failure) => {
      const input = photo('heic', MAX_PHOTO_SIZE_BYTES + 1);
      if (failure === 'rejection') {
        vi.mocked(heicTo).mockRejectedValue(new Error('decoder internal error'));
      } else {
        vi.mocked(heicTo).mockResolvedValue(new Blob([]));
      }

      await expect(compressImage(input)).rejects.toThrow(
        'This HEIC/HEIF photo could not be decoded. Please try another photo or export it as JPG.',
      );
      expect(heicTo).toHaveBeenCalledTimes(1);
      expect(imageCompression).not.toHaveBeenCalled();
    },
  );

  it('reports a readable compression error', async () => {
    vi.mocked(imageCompression).mockRejectedValue(new Error('codec internal error'));

    await expect(compressImage(photo('png', MAX_PHOTO_SIZE_BYTES + 1))).rejects.toThrow(
      'This image could not be compressed. Please try a JPG, PNG, or WebP photo.',
    );
    expect(imageCompression).toHaveBeenCalledTimes(1);
    expect(heicTo).not.toHaveBeenCalled();
  });

  it('rejects an empty compression result', async () => {
    vi.mocked(imageCompression).mockResolvedValue(
      new File([], 'empty.jpg', { type: 'image/jpeg' }),
    );

    await expect(compressImage(photo('jpeg', MAX_PHOTO_SIZE_BYTES + 1))).rejects.toThrow(
      'This image could not be processed. Please choose another photo.',
    );
  });

  it('rejects a compression result one byte over the size limit', async () => {
    vi.mocked(imageCompression).mockResolvedValue(photo('jpeg', MAX_PHOTO_SIZE_BYTES + 1));

    await expect(compressImage(photo('jpeg', 10 * 1024 * 1024))).rejects.toThrow(
      'This image could not be reduced below 1 MB. Please choose a smaller photo.',
    );
  });

  it('accepts a compression result at exactly the size limit', async () => {
    vi.mocked(imageCompression).mockResolvedValue(photo('jpeg', 1_048_576));

    const result = await compressImage(photo('jpeg', MAX_PHOTO_SIZE_BYTES + 1));

    expect(result).toBeInstanceOf(File);
    expect(result.size).toBe(1_048_576);
  });
});
