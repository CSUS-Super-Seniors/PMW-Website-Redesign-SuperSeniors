import { beforeEach, describe, expect, it, vi } from 'vitest';
import { compressImage, detectPhotoType } from './compressImage';
import { MAX_ORIGINAL_PHOTO_BYTES, prepareEstimatePhoto } from './estimatePhotos';

vi.mock('./compressImage', () => ({ compressImage: vi.fn(), detectPhotoType: vi.fn() }));

const jpeg = [0xff, 0xd8, 0xff, 0xe0];
const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
function photo(header: number[], size = 100, type = 'image/jpeg') {
  const bytes = new Uint8Array(size);
  bytes.set(header);
  return new File([bytes], 'chair.jpg', { type });
}

beforeEach(() => {
  vi.mocked(detectPhotoType).mockReset();
  vi.mocked(detectPhotoType).mockResolvedValue('image/jpeg');
  vi.mocked(compressImage).mockReset();
  vi.mocked(compressImage).mockImplementation(async (file) => file);
});

describe('prepareEstimatePhoto', () => {
  it.each([
    { header: jpeg, type: 'image/jpeg' as const },
    { header: png, type: 'image/png' as const },
  ])('accepts supported detected types and uses existing compression', async ({ header, type }) => {
    vi.mocked(detectPhotoType).mockResolvedValue(type);
    const input = photo(header, 100, type);
    expect(await prepareEstimatePhoto(input)).toBe(input);
    expect(detectPhotoType).toHaveBeenCalledWith(input);
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
    expect(detectPhotoType).not.toHaveBeenCalled();
  });

  it.each([
    { detected: undefined },
    { detected: 'image/webp' as const },
    { detected: 'image/heic' as const },
  ])(
    'rejects unsupported detected types, regardless of file hints: $detected',
    async ({ detected }) => {
      vi.mocked(detectPhotoType).mockResolvedValue(detected);
      const input = new File(['not a JPG or PNG'], 'fake.jpg', { type: 'image/jpeg' });
      await expect(prepareEstimatePhoto(input)).rejects.toThrow('JPG or PNG');
      expect(compressImage).not.toHaveBeenCalled();
    },
  );

  it('rejects empty files', async () => {
    await expect(prepareEstimatePhoto(new File([], 'empty.png'))).rejects.toThrow('empty');
    expect(compressImage).not.toHaveBeenCalled();
  });

  it('normalizes a generic MIME hint on a real JPEG', async () => {
    const result = await prepareEstimatePhoto(photo(jpeg, 100, 'application/octet-stream'));
    expect(result.type).toBe('image/jpeg');
  });

  it('keeps detection failures readable without attempting compression', async () => {
    vi.mocked(detectPhotoType).mockRejectedValueOnce(new Error('File read failed'));
    await expect(prepareEstimatePhoto(photo(jpeg))).rejects.toThrow(
      'This photo could not be read.',
    );
    expect(compressImage).not.toHaveBeenCalled();
  });

  it('propagates a readable compression failure', async () => {
    vi.mocked(compressImage).mockRejectedValue(new Error('This image could not be compressed.'));
    await expect(prepareEstimatePhoto(photo(jpeg))).rejects.toThrow('could not be compressed');
  });
});
