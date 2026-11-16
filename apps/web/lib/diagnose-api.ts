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
