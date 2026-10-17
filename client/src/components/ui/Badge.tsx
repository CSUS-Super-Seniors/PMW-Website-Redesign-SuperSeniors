import type { HTMLAttributes } from 'react';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-neutral-100 text-dark-brown',
  success: 'bg-success-light text-dark-brown',
  warning: 'bg-warning-light text-dark-brown',
  error: 'bg-error-light text-error-dark',
  info: 'bg-info-light text-dark-brown',
};

export function Badge({ variant = 'default', className = '', children, ...props }: BadgeProps) {
  const classes = [
    'type-label inline-flex items-center rounded-sm px-3 py-1',
    variantStyles[variant],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span {...props} className={classes}>
      {children}
    </span>
  );
}
