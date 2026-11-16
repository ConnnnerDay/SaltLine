import { InternalApiError } from './internal-api-client'

export type ApiFailure =
  | 'missing_signing_keys'
  | 'api_unreachable'
  | 'signature_rejected'
  | 'api_error'

/**
 * Sorts an `internalApiFetch` failure into the handful of real causes a
 * self-hoster hits, so the server log (and `/api/health`) name the fix
 * instead of the visitor-facing "Couldn't load the forecast" card's
 * deliberately generic message. Never includes secrets or response bodies.
 */
export function classifyApiFailure(err: unknown): { kind: ApiFailure; hint: string } {
  if (err instanceof InternalApiError) {
    if (err.status === 401 || err.status === 403) {
      return {
        kind: 'signature_rejected',
        hint:
          'apps/api rejected the request signature: INTERNAL_SIGNING_KEY_ID and ' +
          'INTERNAL_SIGNING_KEY_SECRET must be identical for apps/web and apps/api, ' +
          'and both machines\' clocks must be correct.',
      }
    }
    return {
      kind: 'api_error',
      hint: `apps/api answered with HTTP ${err.status}; check the apps/api log for the same request_id.`,
    }
  }
  const message = err instanceof Error ? err.message : String(err)
  if (message.includes('INTERNAL_SIGNING_KEY')) {
    return {
      kind: 'missing_signing_keys',
      hint:
        'INTERNAL_SIGNING_KEY_ID and INTERNAL_SIGNING_KEY_SECRET are not set for apps/web. ' +
        'Set the same values for both apps.',
    }
  }
  return {
    kind: 'api_unreachable',
    hint:
      `apps/web could not reach apps/api at ${process.env.INTERNAL_API_BASE_URL ?? 'http://localhost:8000'}. ` +
      'Is apps/api running (uvicorn app.main:app), and is INTERNAL_API_BASE_URL right?',
  }
}

/** One structured server-log line for a failed forecast fetch. */
export function logForecastFailure(locationId: string, err: unknown): void {
  const { kind, hint } = classifyApiFailure(err)
  console.error(
    JSON.stringify({ event: 'forecast_fetch_failed', location_id: locationId, kind, hint }),
  )
}

/**
 * A short, plain-language reason for the forecast error card, safe to
 * show any visitor: a cause and a code, never URLs, keys or response
 * bodies. Self-hosters see what's wrong on the page itself instead of
 * having to dig through server logs.
 */
export function userFacingReason(err: unknown): string {
  const { kind } = classifyApiFailure(err)
  const selfHost = 'If you host this Saltline yourself, run ./install.sh to set it up and start it.'
  switch (kind) {
    case 'missing_signing_keys':
      return `The website isn't configured to reach Saltline's forecast service. ${selfHost} (code: ${kind})`
    case 'api_unreachable':
      return `Saltline's forecast service isn't running or can't be reached. ${selfHost} (code: ${kind})`
    case 'signature_rejected':
      return `The website and the forecast service don't share the same keys. ${selfHost} (code: ${kind})`
    default: {
      const status = err instanceof InternalApiError ? ` HTTP ${err.status}` : ''
      return `Saltline's forecast service hit an error${status}. It's logged on the server. (code: ${kind})`
    }
  }
}
