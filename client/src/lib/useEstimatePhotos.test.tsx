import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEstimatePhotos } from './useEstimatePhotos';
import { prepareEstimatePhoto } from './estimatePhotos';
import { startPhotoSession, renewPhotoSession, uploadEstimatePhoto } from './uploadEstimatePhoto';

vi.mock('./estimatePhotos', () => ({ prepareEstimatePhoto: vi.fn() }));
vi.mock('./uploadEstimatePhoto', () => ({
  startPhotoSession: vi.fn(),
  renewPhotoSession: vi.fn(),
  uploadEstimatePhoto: vi.fn(),
}));
const first = new File(['first'], 'chair.jpg', { type: 'image/jpeg' });
const second = new File(['second'], 'table.jpg', { type: 'image/jpeg' });
const session = { token: 'session-proof', expiresAt: 4102444800 };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prepareEstimatePhoto).mockImplementation(async (file) => file);
  vi.mocked(startPhotoSession).mockResolvedValue(session);
  vi.mocked(renewPhotoSession).mockResolvedValue(session);
  vi.mocked(uploadEstimatePhoto).mockImplementation(async (_session, id) => ({
    id,
    storagePath: `private/${id}.jpg`,
    receipt: `proof-${id}`,
  }));
});

describe('photo upload lifecycle', () => {
  it('does not upload until requested and zero photos requires no backend', async () => {
    const { result } = renderHook(() => useEstimatePhotos());
    expect(await result.current.uploadPhotos()).toEqual({ photoSession: null, photos: [] });
    act(() => result.current.addPhotos([first]));
    await waitFor(() => expect(result.current.photos[0].status).toBe('ready'));
    expect(startPhotoSession).not.toHaveBeenCalled();
    expect(uploadEstimatePhoto).not.toHaveBeenCalled();
  });

  it('uploads processed files and preserves successes across retry/Back', async () => {
    vi.mocked(uploadEstimatePhoto).mockRejectedValueOnce(new Error('Storage offline'));
    const { result } = renderHook(() => useEstimatePhotos());
    act(() => result.current.addPhotos([first, second]));
    await waitFor(() =>
      expect(result.current.photos.every((p) => p.status === 'ready')).toBe(true),
    );
    await act(async () => {
      await expect(result.current.uploadPhotos()).rejects.toThrow('Some photos');
    });
    expect(uploadEstimatePhoto).toHaveBeenCalledTimes(2);
    const failed = result.current.photos[0];
    expect(failed.status === 'ready' && failed.uploadError).toBe('Storage offline');
    let handoff;
    await act(async () => {
      handoff = await result.current.uploadPhotos();
    });
    expect(handoff).toMatchObject({
      photoSession: session,
      photos: [{ id: failed.id }, { id: result.current.photos[1].id }],
    });
    expect(uploadEstimatePhoto).toHaveBeenCalledTimes(3);
    await act(async () => {
      await result.current.uploadPhotos();
    });
    expect(uploadEstimatePhoto).toHaveBeenCalledTimes(3);
    expect(prepareEstimatePhoto).toHaveBeenCalledTimes(2);
  });

  it('excludes removed uploaded files from the submission handoff', async () => {
    const { result } = renderHook(() => useEstimatePhotos());
    act(() => result.current.addPhotos([first, second]));
    await waitFor(() =>
      expect(result.current.photos.filter((p) => p.status === 'ready')).toHaveLength(2),
    );
    await act(async () => {
      await result.current.uploadPhotos();
    });
    act(() => result.current.removePhoto(result.current.photos[0].id));
    let handoff;
    await act(async () => {
      handoff = await result.current.uploadPhotos();
    });
    expect(handoff).toMatchObject({ photos: [{ id: result.current.photos[0].id }] });
    expect(uploadEstimatePhoto).toHaveBeenCalledTimes(2);
  });

  it('prevents duplicate upload operations and excludes a removal racing with upload', async () => {
    let finish!: (value: { id: string; storagePath: string; receipt: string }) => void;
    vi.mocked(uploadEstimatePhoto).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = renderHook(() => useEstimatePhotos());
    act(() => result.current.addPhotos([first]));
    await waitFor(() => expect(result.current.photos[0].status).toBe('ready'));
    const id = result.current.photos[0].id;
    let operation!: ReturnType<typeof result.current.uploadPhotos>;
    await act(async () => {
      operation = result.current.uploadPhotos();
      await Promise.resolve();
    });
    await expect(result.current.uploadPhotos()).rejects.toThrow('already uploading');
    act(() => result.current.removePhoto(id));
    await act(async () => {
      finish({ id, storagePath: 'private/photo.jpg', receipt: 'proof' });
      expect((await operation).photos).toEqual([]);
    });
    expect(result.current.photos).toEqual([]);
  });

  it('refreshes an expired session and reuploads under the new capability', async () => {
    vi.mocked(startPhotoSession).mockResolvedValueOnce({
      token: 'old',
      expiresAt: Math.floor(Date.now() / 1000) - 1,
    });
    const { result } = renderHook(() => useEstimatePhotos());
    act(() => result.current.addPhotos([first]));
    await waitFor(() => expect(result.current.photos[0].status).toBe('ready'));
    await act(async () => {
      await result.current.uploadPhotos();
      await result.current.uploadPhotos();
    });
    expect(startPhotoSession).toHaveBeenCalledTimes(1);
    expect(renewPhotoSession).toHaveBeenCalledWith(expect.objectContaining({ token: 'old' }));
    expect(uploadEstimatePhoto).toHaveBeenLastCalledWith(session, expect.any(String), first);
  });
  it('renews the original expired session even after all photos are removed', async () => {
    const expired = { token: 'original-session', expiresAt: Math.floor(Date.now() / 1000) - 1 };
    vi.mocked(startPhotoSession).mockResolvedValueOnce(expired);
    const { result } = renderHook(() => useEstimatePhotos());
    act(() => result.current.addPhotos([first]));
    await waitFor(() => expect(result.current.photos[0].status).toBe('ready'));
    await act(async () => {
      await result.current.uploadPhotos();
    });
    act(() => result.current.removePhoto(result.current.photos[0].id));
    await act(async () => {
      expect(await result.current.uploadPhotos()).toEqual({ photoSession: session, photos: [] });
    });
    expect(renewPhotoSession).toHaveBeenCalledWith(expired);
    expect(uploadEstimatePhoto).toHaveBeenCalledTimes(1);
  });
  it('keeps the old capability after failed renewal so the next retry preserves identity', async () => {
    const expired = { token: 'original-session', expiresAt: Math.floor(Date.now() / 1000) - 1 };
    vi.mocked(startPhotoSession).mockResolvedValueOnce(expired);
    vi.mocked(renewPhotoSession).mockRejectedValueOnce(new Error('Connection lost'));
    const { result } = renderHook(() => useEstimatePhotos());
    act(() => result.current.addPhotos([first]));
    await waitFor(() => expect(result.current.photos[0].status).toBe('ready'));
    await act(async () => {
      await result.current.uploadPhotos();
    });
    await act(async () => {
      await expect(result.current.uploadPhotos()).rejects.toThrow('Connection lost');
    });
    expect(result.current.photos).toHaveLength(1);
    await act(async () => {
      await result.current.uploadPhotos();
    });
    expect(renewPhotoSession).toHaveBeenNthCalledWith(1, expired);
    expect(renewPhotoSession).toHaveBeenNthCalledWith(2, expired);
    expect(startPhotoSession).toHaveBeenCalledTimes(1);
  });
});
