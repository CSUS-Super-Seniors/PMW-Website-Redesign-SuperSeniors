/**
 * Logo symbol only, used in the phone header (Figma "Logo Mark", 40x40).
 */
type LogoMarkProps = {
  className?: string;
  /** Accessible name. Pass an empty string when a parent link already names it. */
  title?: string;
};

export default function LogoMark({
  className,
  title = 'Peterson Mobile Woodworking',
}: LogoMarkProps) {
  return (
    <svg
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <path
        d="M40 0H0V14.25H9.08125L6.58125 24.25H15.9125L13.4125 14.25H26.5812L24.0812 24.25H33.4125L30.9125 14.25H40V0Z"
        className="fill-logo-walnut"
      />
      <path
        d="M0 40H40V15.75H32.8312L35.3312 25.75H22.1625L24.6625 15.75H15.3313L17.8313 25.75H4.6625L7.1625 15.75H0V40Z"
        className="fill-logo-amber"
      />
    </svg>
  );
}
