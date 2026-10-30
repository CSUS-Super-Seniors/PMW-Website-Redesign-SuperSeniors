/**
 * Shared layout for the in-page message banners. Not exported from the UI kit:
 * use ErrorBanner or SuccessBanner, which pick the tone.
 */
export interface BannerContentProps {
  message: string;
  /** Optional bold first line above the message. */
  title?: string;
  onDismiss?: () => void;
  className?: string;
}

const tones = {
  error: {
    role: 'alert',
    box: 'border-error bg-error-light',
    icon: 'bg-error',
    glyph: '!',
    dismissLabel: 'Dismiss error',
  },
  success: {
    role: 'status',
    box: 'border-success bg-success-light',
    icon: 'bg-success',
    glyph: '✓',
    dismissLabel: 'Dismiss message',
  },
} as const;

export function Banner({
  tone,
  message,
  title,
  onDismiss,
  className = '',
}: BannerContentProps & { tone: keyof typeof tones }) {
  const style = tones[tone];

  return (
    <div
      role={style.role}
      className={[
        'flex w-full items-start gap-3 rounded-lg border p-4 text-dark-brown',
        style.box,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span
        aria-hidden="true"
        className={`flex size-6 shrink-0 items-center justify-center rounded-full text-white ${style.icon}`}
      >
        {style.glyph}
      </span>

      <div className="min-w-0 flex-1 break-words">
        {title && <p className="type-label">{title}</p>}
        <p className="type-body">{message}</p>
      </div>

      {onDismiss && (
        <button
          type="button"
          aria-label={style.dismissLabel}
          onClick={onDismiss}
          className="type-body flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-sm hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
        >
          <span aria-hidden="true">×</span>
        </button>
      )}
    </div>
  );
}
