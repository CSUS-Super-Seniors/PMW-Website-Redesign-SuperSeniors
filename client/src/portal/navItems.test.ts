import { describe, expect, it } from 'vitest';
import { getMoreItems, getBottomBarItems, getNavItemsForRole, navItems } from './navItems';

describe('getNavItemsForRole', () => {
  it('shows an Employee only Dashboard and Schedule', () => {
    const labels = getNavItemsForRole('employee').map((item) => item.label);
    expect(labels).toEqual(['Dashboard', 'Schedule']);
  });

  it('shows an Owner every nav item', () => {
    const items = getNavItemsForRole('owner');
    expect(items).toHaveLength(navItems.length);
  });

  it('hides Customers, Reports, Staff accounts, and Testimonials from an Employee', () => {
    const labels = getNavItemsForRole('employee').map((item) => item.label);
    expect(labels).not.toContain('Customers');
    expect(labels).not.toContain('Reports');
    expect(labels).not.toContain('Staff accounts');
    expect(labels).not.toContain('Testimonials');
  });
});

describe('bottom bar and More menu', () => {
  it('puts four main items in the Owner bottom bar', () => {
    const labels = getBottomBarItems('owner').map((item) => item.label);
    expect(labels).toEqual(['Dashboard', 'Inquiries', 'Schedule', 'Customers']);
  });

  it('puts the rest of the Owner items in More', () => {
    const labels = getMoreItems('owner').map((item) => item.label);
    expect(labels).toEqual(['Testimonials', 'Reports', 'Staff accounts']);
  });

  it('splits the Employee items between the bar and More', () => {
    const bar = getBottomBarItems('employee').map((item) => item.label);
    const more = getMoreItems('employee').map((item) => item.label);
    expect(bar).toEqual(['Dashboard', 'Schedule']);
    expect(more).toEqual([]);
  });

  it('puts every item in exactly one place', () => {
    for (const role of ['owner', 'employee'] as const) {
      const total = getBottomBarItems(role).length + getMoreItems(role).length;
      expect(total).toBe(getNavItemsForRole(role).length);
    }
  });
});
