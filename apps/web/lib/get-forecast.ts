import { internalApiFetch } from './internal-api-client'
import type { ForecastEnvelope } from '@/app/components/forecast-card'

/**
 * Shared by app/forecast/[locationId]/page.tsx (the authenticated core
 * flow, sprint 29) and app/share/[locationId]/page.tsx (the public,
 * non-personalized share page, sprint 49) -- both fetch the exact same
 * apps/api forecast for a location_id, so this is the one place that
 * call is made rather than copied twice. Each page still wraps this in
 * its own local `cache()` (React's request-scoped memoization) since
 * `cache()` keys are per-call-site, not shareable across modules.
 */
export function fetchForecast(locationId: string): Promise<ForecastEnvelope> {
  return internalApiFetch<ForecastEnvelope>(
    `/v1/forecasts/${encodeURIComponent(locationId)}`,
  )
}
