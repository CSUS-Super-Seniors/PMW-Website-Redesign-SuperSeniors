import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { checkEstimateServiceArea } from './checkEstimateServiceArea';

const fetchMock = vi.fn<typeof fetch>();
const signal = new AbortController().signal;

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

it('sends only the city and returns the answer', async () => {
  fetchMock.mockResolvedValue(Response.json({ inServiceArea: false }));
  await expect(checkEstimateServiceArea('Davis', signal)).resolves.toBe(false);
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/estimates/service-area', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ city: 'Davis' }),
    signal,
  });

  fetchMock.mockResolvedValue(Response.json({ inServiceArea: true }));
  await expect(checkEstimateServiceArea('Carmichael', signal)).resolves.toBe(true);
});

it.each([
  () => Response.json({ error: 'down' }, { status: 503 }),
  () => Response.json({ inServiceArea: true }, { status: 500 }),
  () => Response.json({ inServiceArea: 'yes' }),
  () => Response.json({}),
  () => new Response('not json'),
])('throws instead of approving on an unexpected response', async (response) => {
  fetchMock.mockResolvedValue(response());
  await expect(checkEstimateServiceArea('Carmichael', signal)).rejects.toThrow();
});
