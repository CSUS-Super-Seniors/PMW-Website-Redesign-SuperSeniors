import { describe, expect, it } from 'vitest';
import { getNavItemsForRole, navItems } from './navItems';

describe('getNavItemsForRole', () => {
  it('shows an Employee only Dashboard, Schedule, and Testimonials', () => {
    const labels = getNavItemsForRole('Employee').map((item) => item.label);
    expect(labels).toEqual(['Dashboard', 'Schedule', 'Testimonials']);
  });

  it('shows an Owner every nav item', () => {
    const items = getNavItemsForRole('Owner');
    expect(items).toHaveLength(navItems.length);
  });

  it('hides Customers, Reports, and Staff accounts from an Employee', () => {
    const labels = getNavItemsForRole('Employee').map((item) => item.label);
    expect(labels).not.toContain('Customers');
    expect(labels).not.toContain('Reports');
    expect(labels).not.toContain('Staff accounts');
  });
});
