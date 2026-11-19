/** Turns database and network errors into plain sentences for the owners. */
export class AppError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

interface PgLikeError {
  code?: string;
  message?: string;
}

export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  const err = (e ?? {}) as PgLikeError;
  const msg = err.message ?? String(e);

  if (err.code === '23P01' || msg.includes('stays_no_double_booking')) {
    return new AppError('Those dates are already taken by a confirmed or checked-in stay. Nothing was saved.', err.code);
  }
  if (err.code === '23505' && msg.includes('phone')) {
    return new AppError('A guest with this phone number already exists.', err.code);
  }
  if (msg.includes('review_request_has_no_incentive')) {
    return new AppError('A review request can’t mention a discount, offer or gift. Google removes reviews like that.', err.code);
  }
  if (err.code === '42501') {
    return new AppError('That change isn’t allowed.', err.code);
  }
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return new AppError('No connection. Nothing was saved; try again when you have signal.', 'offline');
  }
  return new AppError(msg, err.code);
}
