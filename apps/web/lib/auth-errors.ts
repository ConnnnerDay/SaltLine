/**
 * Better Auth's error messages are written for developers ("Invalid
 * token", "User already exists. Use another email."). These are the ones
 * people actually hit on the login, sign-up and reset pages, said plainly
 * with what to do next. Anything else falls back to its own message.
 */
const MESSAGES: Record<string, string> = {
  INVALID_TOKEN:
    'This reset link is invalid or has expired. Request a new one from “Forgot password?” on the login page.',
  USER_ALREADY_EXISTS:
    'There’s already an account with that email. Log in instead, or reset your password if you’ve forgotten it.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
    'There’s already an account with that email. Log in instead, or reset your password if you’ve forgotten it.',
  PASSWORD_TOO_SHORT: 'Your password needs at least 8 characters.',
  PASSWORD_TOO_LONG: 'That password is too long. Use 128 characters or fewer.',
  INVALID_EMAIL_OR_PASSWORD: 'That email and password don’t match. Check them, or reset your password.',
  INVALID_EMAIL: 'That doesn’t look like an email address.',
  EMAIL_NOT_VERIFIED: 'Confirm your email first: open the link we sent to your inbox.',
}

export function authErrorMessage(
  error: { code?: string; message?: string } | null | undefined,
  fallback: string,
): string {
  return (error?.code && MESSAGES[error.code]) || error?.message || fallback
}
