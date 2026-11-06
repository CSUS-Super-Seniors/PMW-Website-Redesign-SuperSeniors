import { beforeEach, describe, expect, it, vi } from 'vitest';
import { compressImage } from './compressImage';
import { MAX_ORIGINAL_PHOTO_BYTES, prepareEstimatePhoto } from './estimatePhotos';

vi.mock('./compressImage', () => ({ compressImage: vi.fn() }));

const jpeg = [0xff, 0xd8, 0xff, 0xe0];
const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
function photo(header: number[], size = 100, type = 'image/jpeg') {
  const bytes = new Uint8Array(size);
  bytes.set(header);
  return new File([bytes], 'chair.jpg', { type });
}

beforeEach(() => {
  vi.mocked(compressImage).mockReset();
  vi.mocked(compressImage).mockImplementation(async (file) => file);
});

describe('prepareEstimatePhoto', () => {
  it.each([
    { header: jpeg, type: 'image/jpeg' },
    { header: png, type: 'image/png' },
  ])('accepts supported image headers and uses existing compression', async ({ header, type }) => {
    const input = photo(header, 100, type);
    expect(await prepareEstimatePhoto(input)).toBe(input);
    expect(compressImage).toHaveBeenCalledWith(input);
  });

  it('accepts exactly 10 MiB before compression', async () => {
    const input = photo(jpeg, MAX_ORIGINAL_PHOTO_BYTES);
    await prepareEstimatePhoto(input);
    expect(compressImage).toHaveBeenCalledWith(input);
  });

  it('rejects one byte above the original limit without compressing', async () => {
    await expect(prepareEstimatePhoto(photo(jpeg, MAX_ORIGINAL_PHOTO_BYTES + 1))).rejects.toThrow(
      '10 MB or less',
    );
    expect(compressImage).not.toHaveBeenCalled();
  });

  it.each([
    new File(['not a photo'], 'fake.jpg', { type: 'image/jpeg' }),
    new File(['RIFFxxxxxxxxWEBP'], 'photo.webp', { type: 'image/webp' }),
  ])('rejects unsupported bytes, regardless of file hints', async (input) => {
    await expect(prepareEstimatePhoto(input)).rejects.toThrow('JPG or PNG');
    expect(compressImage).not.toHaveBeenCalled();
  });

  it('rejects empty files', async () => {
    await expect(prepareEstimatePhoto(new File([], 'empty.png'))).rejects.toThrow('empty');
    expect(compressImage).not.toHaveBeenCalled();
  });

  it('normalizes a generic MIME hint on a real JPEG', async () => {
    const result = await prepareEstimatePhoto(photo(jpeg, 100, 'application/octet-stream'));
    expect(result.type).toBe('image/jpeg');
  });

  it('propagates a readable compression failure', async () => {
    vi.mocked(compressImage).mockRejectedValue(new Error('This image could not be compressed.'));
    await expect(prepareEstimatePhoto(photo(jpeg))).rejects.toThrow('could not be compressed');
  });
});
