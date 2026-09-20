import { ForecastLoadingBody } from '@/app/components/forecast-loading-body'

/**
 * Next's App Router loading-file convention: this route is
 * `force-dynamic` (see page.tsx's own comment on why -- forecasts are
 * live, per-request data) and its fetch can take real seconds against
 * live upstreams, so without this file the browser shows a blank page
 * for that whole wait. See app/components/forecast-loading-body.tsx for
 * the shared skeleton this and app/share/[locationId]/loading.tsx both
 * render.
 */
export default function ForecastLoading() {
  return <ForecastLoadingBody backHref="/locations" backLabel="Back to search" />
}
