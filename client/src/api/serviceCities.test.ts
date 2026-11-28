import { afterEach, expect, it, vi } from 'vitest';
import { fetchServiceCities } from './serviceCities';

afterEach(() => vi.unstubAllGlobals());

it('fetches current cities without caching and preserves response order', async () => {
  const cities = [{ name: 'Carmichael' }, { name: 'Unranked city' }];
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ cities }));
  vi.stubGlobal('fetch', fetchMock);
  const signal = new AbortController().signal;
  await expect(fetchServiceCities(signal)).resolves.toEqual(cities);
  expect(fetchMock).toHaveBeenCalledWith('/api/service-cities', { signal, cache: 'no-store' });
});

it('accepts a genuinely empty list', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ cities: [] })));
  await expect(fetchServiceCities(new AbortController().signal)).resolves.toEqual([]);
});

it.each([
  () => Response.json({ cities: [{ name: 'Carmichael' }] }, { status: 503 }),
  () => Response.json({}),
  () => Response.json({ cities: null }),
  () => Response.json({ cities: [{ name: 1 }] }),
  () => Response.json({ cities: [{ name: ' ' }] }),
  () => new Response('not json'),
])('rejects unusable responses rather than substituting cities', async (response) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()));
  await expect(fetchServiceCities(new AbortController().signal)).rejects.toThrow();
});

it('propagates abort and network failure', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')));
  await expect(fetchServiceCities(new AbortController().signal)).rejects.toThrow();
});
