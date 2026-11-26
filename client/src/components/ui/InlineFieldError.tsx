import { AlertCircleIcon } from '../icons';

export interface InlineFieldErrorProps {
  id: string;
  message?: string;
  className?: string;
  showIcon?: boolean;
}

export function InlineFieldError({
  id,
  message,
  className = '',
  showIcon = false,
}: InlineFieldErrorProps) {
  if (!message) return null;

  return (
    <p
      id={id}
      role="alert"
      className={['type-body-sm text-error', showIcon ? 'flex items-start gap-1.5' : '', className]
        .filter(Boolean)
        .join(' ')}
    >
      {showIcon ? (
        <>
          <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
          <span>{message}</span>
        </>
      ) : (
        message
      )}
    </p>
  );
}
