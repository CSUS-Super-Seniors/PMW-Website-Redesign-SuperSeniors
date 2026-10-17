import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
}

export function Checkbox({ label, id, className = '', disabled = false, ...props }: CheckboxProps) {
  const generatedId = useId();
  const checkboxId = id ?? generatedId;

  return (
    <div className="flex items-start gap-3">
      <input
        {...props}
        id={checkboxId}
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
        htmlFor={checkboxId}
        className={[
          'type-body cursor-pointer text-dark-brown',
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
