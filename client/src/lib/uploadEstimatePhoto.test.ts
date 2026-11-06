import { afterEach, expect, it, vi } from 'vitest';
import {
  PHOTO_REQUEST_TIMEOUT_MS,
  startPhotoSession,
  renewPhotoSession,
  uploadEstimatePhoto,
} from './uploadEstimatePhoto';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const id = '11111111-1111-4111-8111-111111111111';
const session = { token: 'proof', expiresAt: 4102444800 };

it('posts a session and sends processed binary bytes with its scoped authorization', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(Response.json(session))
    .mockResolvedValueOnce(
      Response.json({ id, storagePath: 'private/path.jpg', receipt: 'receipt' }),
    );
  vi.stubGlobal('fetch', fetchMock);
  expect(await startPhotoSession()).toEqual(session);
  const file = new File(['compressed'], 'chair.jpg', { type: 'image/jpeg' });
  expect(await uploadEstimatePhoto(session, id, file)).toMatchObject({ id, receipt: 'receipt' });
  expect(fetchMock).toHaveBeenLastCalledWith(`/api/estimates/photos/${id}`, {
    method: 'PUT',
    headers: { Authorization: 'Photo proof', 'Content-Type': 'image/jpeg' },
    body: file,
    signal: expect.any(AbortSignal),
  });
});

it.each(['session', 'renewal', 'upload', 'body'] as const)(
  'times out a stalled %s and aborts its transport',
  async (phase) => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, init) => {
        signal = init.signal;
        if (phase === 'body')
          return Promise.resolve({ ok: true, json: () => new Promise(() => {}) });
        return new Promise(() => {});
      }),
    );
    const operation =
      phase === 'session'
        ? startPhotoSession()
        : phase === 'renewal'
          ? renewPhotoSession(session)
          : uploadEstimatePhoto(session, id, new File(['photo'], 'chair.jpg'));
    const failure = expect(operation).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(PHOTO_REQUEST_TIMEOUT_MS);
    await failure;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  },
);

it('renews using the original capability without exposing it in a URL', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(session));
  vi.stubGlobal('fetch', fetchMock);
  expect(await renewPhotoSession(session)).toEqual(session);
  expect(fetchMock).toHaveBeenCalledWith('/api/estimates/photos/session/renew', {
    method: 'POST',
    headers: { Authorization: 'Photo proof' },
    signal: expect.any(AbortSignal),
  });
});

it('clears the timeout after success and permits a fresh request after timeout', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce(Response.json(session)),
  );
  const failed = expect(startPhotoSession()).rejects.toThrow('timed out');
  await vi.advanceTimersByTimeAsync(PHOTO_REQUEST_TIMEOUT_MS);
  await failed;
  expect(await startPhotoSession()).toEqual(session);
  expect(vi.getTimerCount()).toBe(0);
});

it('shows readable JSON and non-JSON upload errors', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: 'Too many photo requests.' }, { status: 429 }))
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 })),
  );
  await expect(startPhotoSession()).rejects.toThrow('Too many photo requests');
  await expect(uploadEstimatePhoto(session, id, new File([], 'chair.jpg'))).rejects.toThrow(
    'Photo upload failed',
  );
});

it('rejects an unexpected upload identifier', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      Response.json({
        id: '22222222-2222-4222-8222-222222222222',
        storagePath: 'path',
        receipt: 'proof',
      }),
    ),
  );
  await expect(uploadEstimatePhoto(session, id, new File([], 'chair.jpg'))).rejects.toThrow(
    'Unexpected',
  );
});
