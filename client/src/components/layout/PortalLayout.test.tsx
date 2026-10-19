import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { routes } from '../../config/site';
import PortalLayout from './PortalLayout';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/portal" element={<PortalLayout />}>
          <Route path="*" element={<p>Page content</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('PortalLayout', () => {
  it('shows the nav links with their addresses', () => {
    renderAt('/portal/dashboard');
    const nav = screen.getByRole('navigation', { name: 'Portal' });
    expect(within(nav).getByRole('link', { name: 'Customers' })).toHaveAttribute(
      'href',
      '/portal/customers',
    );
  });

  it('marks the current page', () => {
    renderAt('/portal/inquiries');
    const nav = screen.getByRole('navigation', { name: 'Portal' });
    expect(within(nav).getByRole('link', { name: 'Inquiries' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('shows the page title and a link to the public site', () => {
    renderAt('/portal/schedule');
    expect(screen.getByText('Schedule', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View public site' })).toHaveAttribute(
      'href',
      routes.home,
    );
  });
});
