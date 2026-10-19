export interface InlineFieldErrorProps {
  id: string;
  message?: string;
  className?: string;
}

export function InlineFieldError({ id, message, className = '' }: InlineFieldErrorProps) {
  if (!message) return null;

  return (
    <p
      id={id}
      role="alert"
      className={['type-body-sm text-error', className].filter(Boolean).join(' ')}
    >
      {message}
    </p>
  );
}
