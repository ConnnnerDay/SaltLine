/**
 * Small line-drawn sky icons for apps/api's sky categories
 * (`app.providers.nws.sky_category`): clear, partly, cloudy, rain, storm,
 * fog, snow, wind, unknown. Decorative (`aria-hidden`); the forecast
 * text ("Mostly Sunny") always sits beside them.
 */

const SUN = (
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </>
)

const CLOUD = <path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z" />

const ICONS: Record<string, React.ReactNode> = {
  clear: SUN,
  partly: (
    <>
      <path d="M8 3v1.5M3.6 4.8l1 1M2 9h1.5M12.4 4.8l-1 1" />
      <path d="M5.3 11.5A3.2 3.2 0 1 1 11 8.3" />
      <path d="M9 20h8.5a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 8.2 13 3.6 3.6 0 0 0 9 20z" />
    </>
  ),
  cloudy: CLOUD,
  rain: (
    <>
      <path d="M7 15h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 6.5 4.3 4.3 0 0 0 7 15z" />
      <path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3" />
    </>
  ),
  storm: (
    <>
      <path d="M7 15h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 6.5 4.3 4.3 0 0 0 7 15z" />
      <path d="M12.5 15l-2.5 4h3l-2 4" />
    </>
  ),
  fog: (
    <>
      <path d="M7 12h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 3.5 4.3 4.3 0 0 0 7 12z" />
      <path d="M4 16h16M6 20h12" />
    </>
  ),
  snow: (
    <>
      <path d="M7 15h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 6.5 4.3 4.3 0 0 0 7 15z" />
      <path d="M8 19h.01M12 21h.01M16 19h.01" />
    </>
  ),
  wind: <path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8" />,
  unknown: CLOUD,
}

/** Sun-ish skies in amber, wet ones in blue, the rest in the text color. */
const TONE: Record<string, string> = {
  clear: 'text-amber',
  partly: 'text-amber',
  rain: 'text-primary',
  storm: 'text-accent',
  snow: 'text-primary',
}

export function WeatherIcon({ sky, className = 'h-6 w-6' }: { sky: string | null | undefined; className?: string }) {
  const key = sky && ICONS[sky] ? sky : 'unknown'
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${className} shrink-0 ${TONE[key] ?? 'text-text-muted'}`}
    >
      {ICONS[key]}
    </svg>
  )
}
