import { useId, type ReactNode, type TextareaHTMLAttributes } from 'react';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: ReactNode;
  error?: string;
}

export function Textarea({
  label,
  error,
  id,
  className = '',
  disabled = false,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  ...props
}: TextareaProps) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const errorId = `${textareaId}-error`;

  const describedBy = [ariaDescribedBy, error ? errorId : undefined].filter(Boolean).join(' ');

  const textareaClasses = [
    'type-body-lg min-h-32 w-full rounded-sm border bg-white px-4 py-3',
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
      <label htmlFor={textareaId} className="type-label text-dark-brown">
        {label}
      </label>

      <textarea
        {...props}
        id={textareaId}
        disabled={disabled}
        className={textareaClasses}
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
