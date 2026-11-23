export type EmailFailureReason =
  | 'http_error'
  | 'not_configured'
  | 'invalid_response'
  | 'timeout'
  | 'request_error'
  | 'unknown_error';

/** Carries only bounded diagnostics; never retain the provider response body. */
export class EmailDeliveryError extends Error {
  constructor(
    public readonly reason: EmailFailureReason,
    public readonly httpStatus?: number,
    message = 'Email delivery failed.',
  ) {
    super(message);
    this.name = 'EmailDeliveryError';
  }
}

/** Never serialize the thrown value, its message, stack, or an arbitrary name. */
export function emailFailureLogContext(error: unknown): {
  reason: EmailFailureReason;
  httpStatus?: number;
} {
  if (error instanceof EmailDeliveryError) {
    const status = error.httpStatus;
    return {
      reason: error.reason,
      ...(typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599
        ? { httpStatus: status }
        : {}),
    };
  }
  if (error instanceof Error) {
    switch (error.name) {
      case 'AbortError':
      case 'TimeoutError':
        return { reason: 'timeout' };
      case 'SyntaxError':
        return { reason: 'invalid_response' };
      case 'TypeError':
        return { reason: 'request_error' };
    }
  }
  return { reason: 'unknown_error' };
}
