import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode;
  error?: string;
}

export function Input({
  label,
  error,
  id,
  className = '',
  disabled = false,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;

  const describedBy = [ariaDescribedBy, error ? errorId : undefined].filter(Boolean).join(' ');

  const inputClasses = [
    'type-body-lg min-h-12 w-full rounded-sm border bg-white px-4 py-3',
    'text-dark-brown placeholder:text-neutral-600',
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
      <label htmlFor={inputId} className="type-label text-dark-brown">
        {label}
      </label>

      <input
        {...props}
        id={inputId}
        disabled={disabled}
        className={inputClasses}
        aria-invalid={error ? true : ariaInvalid}
        aria-describedby={describedBy || undefined}
      />

      {error && (
        <p id={errorId} className="type-body-sm text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
