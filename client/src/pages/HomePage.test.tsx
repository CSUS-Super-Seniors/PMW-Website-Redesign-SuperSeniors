import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PUBLIC_SERVICE_CITIES_PATH, RECENT_GALLERY_PATH } from '@pmw/validation';
import HomePage from './HomePage';
import { services } from '../config/services';
import { business } from '../config/site';

const id = '00000000-0000-4000-8000-000000000225';
const beforeUrl = `https://example.supabase.co/storage/v1/object/public/gallery/media/${id}.jpg`;
const afterUrl = beforeUrl.replace('.jpg', '.png');

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

function mockContent(cities = ['Carmichael', 'Fair Oaks'], items: object[] = []) {
  const mock = vi.fn<typeof fetch>(async (url) =>
    Response.json(url === PUBLIC_SERVICE_CITIES_PATH ? { cities } : { items }),
  );
  vi.stubGlobal('fetch', mock);
  return mock;
}

afterEach(() => vi.unstubAllGlobals());

describe('Home (SSPMW-225)', () => {
  it('shows all shared services, correct CTA destinations, and the active city response', async () => {
    const fetchMock = mockContent();
    renderHome();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Furniture repair that comes to you' }),
    ).toBeVisible();
    for (const service of services) {
      expect(screen.getByRole('link', { name: service.name })).toHaveAttribute(
        'href',
        `/services#${service.id}`,
      );
      expect(screen.getByText(service.summary ?? service.description)).toBeVisible();
    }
    for (const [name, path] of [
      ['Request an estimate', '/estimate'],
      [`Call ${business.phoneDisplay}`, business.phoneHref],
      ['See all services', '/services'],
      ['See the gallery', '/gallery'],
      ['See where we work', '/service-area'],
    ])
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', path);
    expect(
      await screen.findByText(/We come to your home in Carmichael and Fair Oaks\./),
    ).toBeVisible();
    expect(await screen.findByText('More before and after photos coming soon')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      PUBLIC_SERVICE_CITIES_PATH,
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('renders replacement service content without changing the layout', async () => {
    mockContent();
    render(
      <MemoryRouter>
        <HomePage
          services={[
            {
              id: 'upholstery',
              name: 'Minor upholstery',
              description: 'Dining chair seats.',
              commonJobs: [],
              photoDescription: 'Chair',
            },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Minor upholstery' })).toHaveAttribute(
      'href',
      '/services#upholstery',
    );
    expect(screen.getByText('Dining chair seats.')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Refinishing' })).not.toBeInTheDocument();
    await screen.findByText(/We come to your home/);
  });

  it('has loading states while leaving actions usable', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    renderHome();
    expect(screen.getByText('Loading recent work…')).toHaveAttribute('role', 'status');
    expect(screen.getByText('Loading the cities we serve…')).toHaveAttribute('role', 'status');
    expect(screen.getByRole('link', { name: 'Request an estimate' })).toBeVisible();
  });

  it('shows paired photos, never renders extra private fields, and replaces broken images', async () => {
    mockContent(undefined, [
      {
        id,
        beforeUrl,
        afterUrl,
        customer_name: 'Private Customer',
        address: '123 Main St',
        job_number: 'J-1001',
      },
    ]);
    const { container } = renderHome();
    const list = await screen.findByRole('list', { name: 'Recent before and after work' });
    expect(within(list).getByRole('img', { name: 'Furniture before repair' })).toHaveAttribute(
      'src',
      beforeUrl,
    );
    const after = within(list).getByRole('img', { name: 'Furniture after repair' });
    fireEvent.error(after);
    expect(within(list).getByText('Photo unavailable')).toBeVisible();
    expect(container.innerHTML).not.toMatch(/Private Customer|123 Main St|J-1001/);
  });

  it('handles a missing stage without implying an unpublished photo is public', async () => {
    mockContent([], [{ id, beforeUrl: null, afterUrl }]);
    renderHome();
    expect(await screen.findByText('Photo not published')).toBeVisible();
    expect(screen.queryByRole('img', { name: 'Furniture before repair' })).not.toBeInTheDocument();
    expect(
      await screen.findByText('Please call us to check whether we serve your city.'),
    ).toBeVisible();
  });

  it('retries each failed section independently and shows updated content', async () => {
    let galleryFails = true;
    let citiesFail = true;
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (
        (url === RECENT_GALLERY_PATH && galleryFails) ||
        (url === PUBLIC_SERVICE_CITIES_PATH && citiesFail)
      ) {
        return Response.json({}, { status: 503 });
      }
      return Response.json(
        url === RECENT_GALLERY_PATH
          ? { items: [{ id, beforeUrl, afterUrl }] }
          : { cities: ['Orangevale'] },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    renderHome();
    await screen.findByText('We could not load our recent work right now.');
    await screen.findByText('We could not load the cities we serve right now.');
    const user = userEvent.setup();
    galleryFails = false;
    await user.click(screen.getByRole('button', { name: 'Try recent work again' }));
    await screen.findByRole('img', { name: 'Furniture before repair' });
    expect(screen.getByText('We could not load the cities we serve right now.')).toBeVisible();
    citiesFail = false;
    await user.click(screen.getByRole('button', { name: 'Try cities again' }));
    expect(await screen.findByText(/We come to your home in Orangevale\./)).toBeVisible();
    expect(fetchMock.mock.calls.filter(([url]) => url === RECENT_GALLERY_PATH)).toHaveLength(2);
    expect(fetchMock.mock.calls.filter(([url]) => url === PUBLIC_SERVICE_CITIES_PATH)).toHaveLength(
      2,
    );
  });

  it('shows an error instead of treating malformed content as an empty gallery', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ items: 'invalid', cities: 123 })),
    );
    renderHome();
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2));
    expect(screen.queryByText('More before and after photos coming soon')).not.toBeInTheDocument();
  });

  it('aborts public reads when navigating away', () => {
    const mock = mockContent();
    const { unmount } = renderHome();
    const signals = mock.mock.calls.map(([, options]) => options?.signal);
    unmount();
    expect(signals).toHaveLength(2);
    for (const signal of signals) expect(signal?.aborted).toBe(true);
  });
});
