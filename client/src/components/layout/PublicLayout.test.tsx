import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { business, mainNav, mobileNav, routes } from '../../config/site';
import PublicLayout from './PublicLayout';

function renderAt(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="*" element={<p>Page content</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const menuButton = () => screen.getByRole('button', { name: /open menu|close menu/i });

afterEach(() => {
  document.body.style.overflow = '';
});

describe('PublicHeader (SSPMW-136)', () => {
  it('shows the phone number as a tap-to-call link without opening the menu', () => {
    renderAt();
    const header = screen.getByRole('banner');
    const callLinks = within(header)
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href') === business.phoneHref);
    // One in the desktop header, one in the phone header. Neither is inside the menu.
    expect(callLinks).toHaveLength(2);
    expect(within(header).getAllByText(business.phoneDisplay)).toHaveLength(2);
    expect(business.phoneHref).toBe('tel:+19166435686');
  });

  it('has the logo link home, every main nav link, and the estimate button', () => {
    renderAt();
    const header = screen.getByRole('banner');
    const homeLinks = within(header).getAllByRole('link', { name: `${business.name} home` });
    expect(homeLinks.every((link) => link.getAttribute('href') === routes.home)).toBe(true);

    const nav = within(header).getByRole('navigation', { name: 'Main' });
    for (const item of mainNav) {
      expect(within(nav).getByRole('link', { name: item.label })).toHaveAttribute('href', item.to);
    }
    expect(within(header).getByRole('link', { name: 'Request an estimate' })).toHaveAttribute(
      'href',
      routes.requestEstimate,
    );
  });

  it('marks the current page in the desktop nav', () => {
    renderAt(routes.contact);
    const nav = within(screen.getByRole('banner')).getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Contact' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Services' })).not.toHaveAttribute('aria-current');
  });
});

describe('MobileMenu (SSPMW-143)', () => {
  it('is closed by default', () => {
    renderAt();
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Home' })).not.toBeInTheDocument();
  });

  it('opens by tap and shows every link, the phone number and the estimate button', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(menuButton());

    expect(menuButton()).toHaveAttribute('aria-expanded', 'true');
    expect(menuButton()).toHaveAccessibleName('Close menu');
    const menu = document.getElementById(menuButton().getAttribute('aria-controls')!)!;
    for (const item of mobileNav) {
      expect(within(menu).getByRole('link', { name: item.label })).toHaveAttribute('href', item.to);
    }
    expect(within(menu).getByRole('link', { name: /call us/i })).toHaveAttribute(
      'href',
      business.phoneHref,
    );
    expect(within(menu).getByRole('link', { name: 'Request an estimate' })).toBeInTheDocument();
    // Focus moves into the menu and the page behind it stops scrolling.
    expect(within(menu).getByRole('link', { name: 'Home' })).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('closes with the close button and returns focus to it', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(menuButton());
    await user.click(menuButton());

    expect(menuButton()).toHaveAttribute('aria-expanded', 'false');
    expect(menuButton()).toHaveFocus();
    expect(document.body.style.overflow).toBe('');
  });

  it('opens and closes with the keyboard (Enter, then Escape)', async () => {
    const user = userEvent.setup();
    renderAt();
    menuButton().focus();
    await user.keyboard('{Enter}');
    expect(menuButton()).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Escape}');
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false');
    expect(menuButton()).toHaveFocus();
  });

  it('closes when a link is tapped and goes to that page', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(menuButton());
    const menu = document.getElementById(menuButton().getAttribute('aria-controls')!)!;
    await user.click(within(menu).getByRole('link', { name: 'Gallery' }));

    expect(menuButton()).toHaveAttribute('aria-expanded', 'false');
    const nav = within(screen.getByRole('banner')).getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Gallery' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('keeps the phone number visible while the menu is closed', () => {
    renderAt();
    const header = screen.getByRole('banner');
    expect(
      within(header).getByRole('link', { name: `Call ${business.phoneDisplay}` }),
    ).toHaveAttribute('href', business.phoneHref);
  });
});

describe('PublicFooter (SSPMW-139)', () => {
  it('shows Carmichael as the location and no street address', () => {
    renderAt();
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent('Carmichael, CA');
    expect(footer.textContent).not.toMatch(
      /\d+\s+[A-Za-z]+\s+(St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Way|Dr|Drive|Ln|Lane|Ct|Court)\b/,
    );
  });

  it('links to the staff login page', () => {
    renderAt();
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByRole('link', { name: 'Staff login' })).toHaveAttribute(
      'href',
      routes.staffLogin,
    );
  });

  it('has the service, company and get started links', () => {
    renderAt();
    const footer = screen.getByRole('contentinfo');
    const nav = within(footer).getByRole('navigation', { name: 'Footer' });
    expect(
      within(nav)
        .getAllByRole('heading')
        .map((h) => h.textContent),
    ).toEqual(['Services', 'Company', 'Get started']);
    expect(
      within(nav).getByRole('link', { name: `Call ${business.phoneDisplay}` }),
    ).toHaveAttribute('href', business.phoneHref);
  });
});
