import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { business, routes } from '../config/site';
import type { FetchServiceCities } from '../api/serviceCities';
import ServiceAreaPage from './ServiceAreaPage';

function renderPage(loadCities: FetchServiceCities) {
  return render(
    <MemoryRouter>
      <ServiceAreaPage loadCities={loadCities} />
    </MemoryRouter>,
  );
}

describe('ServiceAreaPage', () => {
  it('announces loading, aborts on unmount, and never shows sample chips', async () => {
    const load = vi.fn<FetchServiceCities>(() => new Promise(() => {}));
    const { unmount } = renderPage(load);
    expect(screen.getByRole('status')).toHaveTextContent('Loading cities we serve…');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Request an estimate' })).toHaveAttribute(
      'href',
      routes.requestEstimate,
    );
    const signal = load.mock.calls[0][0];
    unmount();
    expect(signal.aborted).toBe(true);
  });

  it('renders the returned list in order as noninteractive chips', async () => {
    renderPage(async () => [{ name: 'Database city Z' }, { name: 'Database city A' }]);
    const list = await screen.findByRole('list', { name: 'Cities we serve' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Database city Z', 'Database city A']);
    expect(within(list).queryByRole('button')).not.toBeInTheDocument();
    expect(within(list).queryByText('Fair Oaks')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Where we work');
    expect(screen.getByRole('link', { name: `Call ${business.phoneDisplay}` })).toHaveAttribute(
      'href',
      business.phoneHref,
    );
    const image = screen.getByRole('img', { name: /Regional map marking Carmichael/ });
    expect(image).toHaveAttribute('src', '/images/service-area-map.svg');
    expect(screen.getByText(/Geographic data: U.S. Census Bureau/)).toBeInTheDocument();
  });

  it('distinguishes empty success from an error without fallback cities', async () => {
    renderPage(async () => []);
    expect(await screen.findByText(/Our city list is being updated/)).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('shows an error and phone guidance, then retries with a fresh request', async () => {
    const load = vi
      .fn<FetchServiceCities>()
      .mockRejectedValueOnce(new Error('private failure'))
      .mockResolvedValueOnce([{ name: 'Fresh city' }]);
    renderPage(load);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not load the cities we serve',
    );
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByText('private failure')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: `Call ${business.phoneDisplay}` })).toHaveAttribute(
      'href',
      business.phoneHref,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('listitem')).toHaveTextContent('Fresh city');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('ignores a late request after the loader is replaced', async () => {
    let finish!: (cities: { name: string }[]) => void;
    const old = vi.fn<FetchServiceCities>(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const next: FetchServiceCities = async () => [{ name: 'Current city' }];
    const { rerender } = renderPage(old);
    rerender(
      <MemoryRouter>
        <ServiceAreaPage loadCities={next} />
      </MemoryRouter>,
    );
    await screen.findByText('Current city');
    await act(async () => finish([{ name: 'Stale city' }]));
    await waitFor(() => expect(screen.queryByText('Stale city')).not.toBeInTheDocument());
  });
});
