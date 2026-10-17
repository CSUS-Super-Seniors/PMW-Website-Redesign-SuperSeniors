
import type { InputHTMLAttributes, ReactNode } from 'react';

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
}

export function Checkbox({
  label,
  id,
  className = '',
  disabled = false,
  ...props
}: CheckboxProps) {
  const generatedId =
    id ?? props.name ?? props['aria-label']?.toString() ?? 'checkbox';

  return (
    <div className="flex items-start gap-3">
      <input
        {...props}
        id={generatedId}
        type="checkbox"
        disabled={disabled}
        className={[
          'mt-1 size-5 shrink-0 cursor-pointer accent-amber',
          'rounded-sm',
          'focus-visible:outline-2 focus-visible:outline-offset-2',
          'focus-visible:outline-amber',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      />
      <label
        htmlFor={generatedId}
        className={[
          'type-body cursor-pointer text-dark-brown',
          'peer-disabled:cursor-not-allowed',
          disabled ? 'cursor-not-allowed opacity-50' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {label}
      </label>
    </div>
  );
}
