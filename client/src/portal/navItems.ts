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
};

export const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/portal/dashboard', icon: HomeIcon, roles: ['Owner', 'Employee'] },
  { label: 'Inquiries', path: '/portal/inquiries', icon: InboxIcon, roles: ['Owner'] },
  { label: 'Schedule', path: '/portal/schedule', icon: CalendarIcon, roles: ['Owner', 'Employee'] },
  { label: 'Customers', path: '/portal/customers', icon: PeopleIcon, roles: ['Owner'] },
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
