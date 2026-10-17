
import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger';

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const baseStyles =
  'type-button inline-flex min-h-11 items-center justify-center rounded-sm px-5 py-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber disabled:cursor-not-allowed disabled:opacity-50';

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-dark-brown text-white hover:bg-neutral-800',
  secondary:
    'bg-amber text-dark-brown hover:bg-amber-dark',
  outline:
    'border border-dark-brown bg-white text-dark-brown hover:bg-neutral-100',
  danger:
    'bg-error text-white hover:bg-error-dark',
};

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  disabled = false,
  ...props
}: ButtonProps) {
  const classes = [
    baseStyles,
    variantStyles[variant],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      {...props}
      type={type}
      disabled={disabled}
      className={classes}
    />
  );
}
