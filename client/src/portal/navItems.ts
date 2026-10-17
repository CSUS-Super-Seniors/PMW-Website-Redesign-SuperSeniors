/* 
Navigation labels - Desktop (top to bottom): Dashboard (/portal/dashboard). Inquiries(/portal/inquiries), Schedule (/portal/schedule), Customers(/portal/customers), Testimonials(/portal/testimonials), Reports(/portal/reports), Staff accounts(/portal/staff-accounts), Current Logged into account, Log out button
Navigation labels - Mobile (left to right): Dashboard, Inquiries, Schedule, Customers, More [Testimonials, Reports, Staff accounts]

Employees do not see Inquiries, Customers, Reports, Staff accounts
 */
type Role = 'Owner' | 'Employee';

type NavItem = {
  label: string;
  path: string;
  roles: Role[];
};

export const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/portal/dashboard', roles: ['Owner', 'Employee'] },
  { label: 'Inquiries', path: '/portal/inquiries', roles: ['Owner'] },
  { label: 'Schedule', path: '/portal/schedule', roles: ['Owner', 'Employee'] },
  { label: 'Customers', path: '/portal/customers', roles: ['Owner'] },
  { label: 'Testimonials', path: '/portal/testimonials', roles: ['Owner', 'Employee'] },
  { label: 'Reports', path: '/portal/reports', roles: ['Owner'] },
  { label: 'Staff accounts', path: '/portal/staff-accounts', roles: ['Owner'] },
];

export function getNavItemsForRole(userRole: Role): NavItem[] {
  return navItems.filter((item) => item.roles.includes(userRole));
}
