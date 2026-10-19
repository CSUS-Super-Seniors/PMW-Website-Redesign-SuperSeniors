/**
 * Line icons from the Figma design system (24px grid, 2px round stroke).
 * They use currentColor, so set the color with a text-* class on the icon or its parent.
 */
type IconProps = { className?: string };

function Icon({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7H20M4 12H20M4 17H20" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 6L18 18M18 6L6 18" />
    </Icon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 6L15 12L9 18" />
    </Icon>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 11L12 4L20 11V20H14.5V14.5H9.5V20H4V11Z" />
    </Icon>
  );
}

export function InboxIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 13L6.5 5H17.5L20 13V19H4V13Z" />
      <path d="M4 13H9C9 14.7 10.3 16 12 16C13.7 16 15 14.7 15 13H20" />
    </Icon>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 5.5H18C19.1046 5.5 20 6.39543 20 7.5V18C20 19.1046 19.1046 20 18 20H6C4.89543 20 4 19.1046 4 18V7.5C4 6.39543 4.89543 5.5 6 5.5Z" />
      <path d="M4 10H20M8.5 3.5V7M15.5 3.5V7" />
    </Icon>
  );
}

export function PeopleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12.5 8.5C12.5 10.433 10.933 12 9 12C7.067 12 5.5 10.433 5.5 8.5C5.5 6.567 7.067 5 9 5C10.933 5 12.5 6.567 12.5 8.5Z" />
      <path d="M2.5 20C2.5 16.5 5.5 14.5 9 14.5C12.5 14.5 15.5 16.5 15.5 20" />
      <path d="M15.5 5.2C17.2 5.6 18.5 7 18.5 8.8C18.5 10.6 17.2 12 15.5 12.4M18 15C20 15.7 21.5 17.5 21.5 20" />
    </Icon>
  );
}

export function StarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5L14.6 9L20.5 9.8L16.2 14L17.3 20L12 17.1L6.7 20L7.8 14L3.5 9.8L9.4 9L12 3.5Z" />
    </Icon>
  );
}

export function ChartIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 20H7M7 20H12M7 20V12M12 20H17M12 20V5M17 20H20M17 20V9" />
    </Icon>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 10.5H17C18.1046 10.5 19 11.3954 19 12.5V18C19 19.1046 18.1046 20 17 20H7C5.89543 20 5 19.1046 5 18V12.5C5 11.3954 5.89543 10.5 7 10.5Z" />
      <path d="M8 10.5V8C8 5.8 9.8 4 12 4C14.2 4 16 5.8 16 8V10.5" />
    </Icon>
  );
}

export function LogoutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 4H5V20H10M15 16L19 12L15 8M19 12H9" />
    </Icon>
  );
}
