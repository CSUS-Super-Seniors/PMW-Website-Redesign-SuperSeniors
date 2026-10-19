import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import PortalBottomNav from './PortalBottomNav';

function renderNav(path = '/portal/dashboard') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PortalBottomNav />
    </MemoryRouter>,
  );
}

const moreButton = () => screen.getByRole('button', { name: 'More' });

describe('PortalBottomNav', () => {
  it('shows the main tabs and keeps the rest hidden', () => {
    renderNav();
    expect(screen.getByRole('link', { name: 'Inquiries' })).toHaveAttribute(
      'href',
      '/portal/inquiries',
    );
    expect(screen.queryByRole('link', { name: 'Reports' })).not.toBeInTheDocument();
    expect(moreButton()).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the More menu with the remaining items', async () => {
    const user = userEvent.setup();
    renderNav();
    await user.click(moreButton());
    expect(moreButton()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Reports' })).toHaveAttribute(
      'href',
      '/portal/reports',
    );
  });

  it('closes the menu after choosing a page', async () => {
    const user = userEvent.setup();
    renderNav();
    await user.click(moreButton());
    await user.click(screen.getByRole('link', { name: 'Reports' }));
    expect(screen.queryByRole('link', { name: 'Reports' })).not.toBeInTheDocument();
  });

  it('closes the menu when a bottom tab is tapped', async () => {
    const user = userEvent.setup();
    renderNav();
    await user.click(moreButton());
    await user.click(screen.getByRole('link', { name: 'Schedule' }));
    expect(moreButton()).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the menu when Escape is pressed', async () => {
    const user = userEvent.setup();
    renderNav();
    await user.click(moreButton());
    await user.keyboard('{Escape}');
    expect(moreButton()).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the menu when the tab for the current page is tapped', async () => {
    const user = userEvent.setup();
    renderNav('/portal/dashboard');
    await user.click(moreButton());
    await user.click(screen.getByRole('link', { name: 'Dashboard' }));
    expect(moreButton()).toHaveAttribute('aria-expanded', 'false');
  });

  it('stays closed when you go to another tab and come back', async () => {
    const user = userEvent.setup();
    renderNav('/portal/dashboard');
    await user.click(moreButton());
    await user.click(screen.getByRole('link', { name: 'Inquiries' }));
    await user.click(screen.getByRole('link', { name: 'Dashboard' }));
    expect(moreButton()).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the menu when you tap outside the bar', async () => {
    const user = userEvent.setup();
    renderNav();
    await user.click(moreButton());
    await user.click(document.body);
    expect(moreButton()).toHaveAttribute('aria-expanded', 'false');
  });
});
