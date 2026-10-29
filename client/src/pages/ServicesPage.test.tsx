import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { services, type Service } from '../config/services';
import { business, routes } from '../config/site';
import ServicesPage from './ServicesPage';

function renderPage(list?: readonly Service[], path: string = routes.services) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ServicesPage services={list} />
    </MemoryRouter>,
  );
}

/** jsdom has no scrollIntoView, so record which elements the page scrolls to. */
function mockScrollIntoView() {
  const scrolledTo: string[] = [];
  Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
    scrolledTo.push(this.id);
  });
  return scrolledTo;
}

afterEach(() => {
  delete (Element.prototype as Partial<Element>).scrollIntoView;
});

describe('ServicesPage (SSPMW-247)', () => {
  it('shows the page title', () => {
    renderPage();

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Furniture repair, refinishing, and restoration',
      }),
    ).toBeInTheDocument();
  });

  it('renders every service section with its description, common jobs, and photo', () => {
    renderPage();

    expect(services.length).toBeGreaterThan(0);
    for (const service of services) {
      const section = screen.getByRole('region', { name: service.name });
      expect(section).toHaveAttribute('id', service.id);
      expect(
        within(section).getByRole('heading', { level: 2, name: service.name }),
      ).toBeInTheDocument();
      expect(within(section).getByText(service.description)).toBeInTheDocument();

      const jobs = within(section)
        .getAllByRole('listitem')
        .map((item) => item.textContent);
      expect(jobs).toEqual(service.commonJobs);

      expect(
        within(section).getByRole('img', {
          name: `Photo placeholder: ${service.photoDescription}`,
        }),
      ).toBeInTheDocument();
    }
  });

  it('builds the sections from the content list, so a new list changes the page', () => {
    const newList: Service[] = [
      {
        id: 'touch-ups',
        name: 'Touch-ups and repair',
        description: 'Small fixes done in one visit.',
        commonJobs: ['Scratches', 'Loose knobs'],
        photoDescription: 'touched-up table edge',
      },
      {
        id: 'upholstery',
        name: 'Minor upholstery',
        description: 'Kitchen and dining chair seats.',
        commonJobs: ['Dining chair seats'],
        photoDescription: 'recovered chair seat',
      },
    ];
    renderPage(newList);

    const titles = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent)
      .filter((title) => title !== 'Ready for an estimate?');
    expect(titles).toEqual(['Touch-ups and repair', 'Minor upholstery']);
    for (const oldService of services) {
      expect(screen.queryByRole('region', { name: oldService.name })).not.toBeInTheDocument();
    }
  });

  it('lets a visitor request an estimate from the intro and the closing panel, or call', () => {
    renderPage();

    const estimateLinks = screen.getAllByRole('link', { name: 'Request an estimate' });
    expect(estimateLinks).toHaveLength(2);
    for (const link of estimateLinks) {
      expect(link).toHaveAttribute('href', routes.requestEstimate);
    }

    expect(screen.getByRole('link', { name: `Call ${business.phoneDisplay}` })).toHaveAttribute(
      'href',
      business.phoneHref,
    );

    const panel = screen.getByRole('region', { name: 'Ready for an estimate?' });
    expect(within(panel).getByRole('link', { name: 'Request an estimate' })).toHaveAttribute(
      'href',
      routes.requestEstimate,
    );
  });

  it('scrolls to the linked service when the page opens with its anchor', () => {
    const scrolledTo = mockScrollIntoView();
    renderPage(undefined, `${routes.services}#refinishing`);

    expect(scrolledTo).toEqual(['refinishing']);
  });

  it('scrolls again when a link changes the anchor on the open page', async () => {
    const scrolledTo = mockScrollIntoView();
    render(
      <MemoryRouter initialEntries={[routes.services]}>
        <ServicesPage />
        <Link to={`${routes.services}#restoration`}>Go to restoration</Link>
      </MemoryRouter>,
    );
    expect(scrolledTo).toEqual([]);

    await userEvent.click(screen.getByRole('link', { name: 'Go to restoration' }));

    expect(scrolledTo).toEqual(['restoration']);
  });

  it('scrolls back when a link points at the anchor already in the address bar', async () => {
    const scrolledTo = mockScrollIntoView();
    render(
      <MemoryRouter initialEntries={[`${routes.services}#refinishing`]}>
        <ServicesPage />
        <Link to={`${routes.services}#refinishing`}>Back to refinishing</Link>
      </MemoryRouter>,
    );
    expect(scrolledTo).toEqual(['refinishing']);

    await userEvent.click(screen.getByRole('link', { name: 'Back to refinishing' }));

    expect(scrolledTo).toEqual(['refinishing', 'refinishing']);
  });

  it('does not scroll for an anchor that is not a service', () => {
    const scrolledTo = mockScrollIntoView();
    renderPage(undefined, `${routes.services}#estimate-cta-title`);

    expect(scrolledTo).toEqual([]);
  });

  it('leaves out the common jobs heading when a service has no jobs listed', () => {
    renderPage([{ ...services[0], commonJobs: [] }]);

    const section = screen.getByRole('region', { name: services[0].name });
    expect(within(section).queryByRole('heading', { name: 'Common jobs' })).not.toBeInTheDocument();
    expect(within(section).queryByRole('list')).not.toBeInTheDocument();
  });
});
