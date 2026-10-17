import { useId, type ReactNode, type SelectHTMLAttributes } from 'react';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: ReactNode;
  error?: string;
}

export function Select({
  label,
  error,
  id,
  className = '',
  disabled = false,
  children,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  ...props
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const errorId = `${selectId}-error`;

  const describedBy = [ariaDescribedBy, error ? errorId : undefined].filter(Boolean).join(' ');

  const selectClasses = [
    'type-body-lg min-h-12 w-full rounded-sm border bg-white px-4 py-3',
    'text-dark-brown',
    'focus-visible:outline-2 focus-visible:outline-offset-2',
    'disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:opacity-70',
    error
      ? 'border-error focus-visible:outline-error'
      : 'border-neutral-300 focus-visible:outline-amber',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="flex w-full flex-col gap-2">
      <label htmlFor={selectId} className="type-label text-dark-brown">
        {label}
      </label>

      <select
        {...props}
        id={selectId}
        disabled={disabled}
        className={selectClasses}
        aria-invalid={error ? true : ariaInvalid}
        aria-describedby={describedBy || undefined}
      >
        {children}
      </select>

      {error && (
        <p id={errorId} className="type-body-sm text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
