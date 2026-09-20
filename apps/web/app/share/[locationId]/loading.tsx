import { ForecastLoadingBody } from '@/app/components/forecast-loading-body'

/**
 * Same reasoning as app/forecast/[locationId]/loading.tsx -- see that
 * file and app/components/forecast-loading-body.tsx. `backHref` is the
 * one difference: this page's own back link goes to `/`, the route an
 * anonymous visitor can actually reach.
 */
export default function SharedForecastLoading() {
  return <ForecastLoadingBody backHref="/" backLabel="Back to Saltline" />
}
