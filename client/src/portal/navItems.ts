import type { ComponentType } from 'react';
import {
  HomeIcon,
  InboxIcon,
  CalendarIcon,
  PeopleIcon,
  StarIcon,
  ChartIcon,
  LockIcon,
} from '../components/icons';

type Role = 'Owner' | 'Employee';

type NavItem = {
  label: string;
  path: string;
  roles: Role[];
  icon: ComponentType<{ className?: string }>;
  dividerBefore?: boolean;
  inBottomBar?: boolean;
};

export const navItems: NavItem[] = [
  {
    label: 'Dashboard',
    path: '/portal/dashboard',
    icon: HomeIcon,
    inBottomBar: true,
    roles: ['Owner', 'Employee'],
  },
  {
    label: 'Inquiries',
    path: '/portal/inquiries',
    icon: InboxIcon,
    inBottomBar: true,
    roles: ['Owner'],
  },
  {
    label: 'Schedule',
    path: '/portal/schedule',
    icon: CalendarIcon,
    inBottomBar: true,
    roles: ['Owner', 'Employee'],
  },
  {
    label: 'Customers',
    path: '/portal/customers',
    icon: PeopleIcon,
    inBottomBar: true,
    roles: ['Owner'],
  },
  {
    label: 'Testimonials',
    path: '/portal/testimonials',
    icon: StarIcon,
    roles: ['Owner', 'Employee'],
  },
  { label: 'Reports', path: '/portal/reports', icon: ChartIcon, roles: ['Owner'] },
  {
    label: 'Staff accounts',
    path: '/portal/staff-accounts',
    icon: LockIcon,
    dividerBefore: true,
    roles: ['Owner'],
  },
];

export function getNavItemsForRole(userRole: Role): NavItem[] {
  return navItems.filter((item) => item.roles.includes(userRole));
}

export function getBottomBarItems(userRole: Role): NavItem[] {
  return getNavItemsForRole(userRole).filter((item) => item.inBottomBar);
}

export function getMoreItems(userRole: Role): NavItem[] {
  return getNavItemsForRole(userRole).filter((item) => !item.inBottomBar);
}
