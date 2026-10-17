import { describe, expect, it } from 'vitest';
import { getMoreItems, getBottomBarItems, getNavItemsForRole, navItems } from './navItems';

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

describe('bottom bar and More menu', () => {
  it('puts four main items in the Owner bottom bar', () => {
    const labels = getBottomBarItems('Owner').map((item) => item.label);
    expect(labels).toEqual(['Dashboard', 'Inquiries', 'Schedule', 'Customers']);
  });

  it('puts the rest of the Owner items in More', () => {
    const labels = getMoreItems('Owner').map((item) => item.label);
    expect(labels).toEqual(['Testimonials', 'Reports', 'Staff accounts']);
  });

  it('splits the Employee items between the bar and More', () => {
    const bar = getBottomBarItems('Employee').map((item) => item.label);
    const more = getMoreItems('Employee').map((item) => item.label);
    expect(bar).toEqual(['Dashboard', 'Schedule']);
    expect(more).toEqual(['Testimonials']);
  });

  it('puts every item in exactly one place', () => {
    for (const role of ['Owner', 'Employee'] as const) {
      const total = getBottomBarItems(role).length + getMoreItems(role).length;
      expect(total).toBe(getNavItemsForRole(role).length);
    }
  });
});
