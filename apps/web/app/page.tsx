import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { homeLocationId, needsProfileSetup } from '@/lib/home-location'
import { Button, Container } from './components/ui'

/**
 * Landing page, in the original Saltline style: a centered deep-ocean
 * hero (bold wordmark over an Instrument Serif italic subtitle, coral
 * call to action) followed by a row of feature cards. No fabricated
 * verdict badges on the "Popular spots" links below -- showing a
 * plausible-looking Good/Marginal status without a real, current
 * forecast behind it would be exactly the kind of invented data this
 * product's own Integrity rule (docs/product-definition.md) argues
 * against; these are plain links to real curated locations.
 *
 * Signed-in visitors never see this marketing page: like the original
 * app, "/" is their dashboard -- their home spot's forecast
 * (`homeLocationId`), or search when they haven't picked one yet.
 */
const FEATURES = [
  {
    title: 'A rating for today',
    body: 'A score out of 100, from Poor to Excellent, with the wind, surf, water and moon behind it spelled out.',
    color: 'text-[#38c0ff]',
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7 L12 12 L15.5 14" />
      </>
    ),
  },
  {
    title: 'Live data, with sources',
    body: 'NWS marine forecasts, NOAA buoys and tide stations. Each source shows whether its data came through.',
    color: 'text-[#ff6b4a]',
    icon: <path d="M2 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />,
  },
  {
    title: 'When and what',
    body: 'The best hours of the day, the fish that are biting, and the rig and bait to catch them.',
    color: 'text-[#34d399]',
    icon: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
  },
]

const POPULAR_SPOTS = [
  { id: 'wrightsville-beach-nc', label: 'Wrightsville Beach, NC' },
  { id: 'cocoa-beach-fl', label: 'Cocoa Beach / Port Canaveral, FL' },
]

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session) {
    if (await needsProfileSetup(session.user.id)) redirect('/onboarding')
    const home = await homeLocationId(session.user.id)
    redirect(home ? `/forecast/${encodeURIComponent(home)}` : '/locations')
  }

  return (
    <main>
      <section className="ocean-hero px-4 pb-14 pt-14 text-center sm:pt-20">
        <div className="mx-auto flex max-w-xl flex-col items-center gap-5">
          <h1 className="flex flex-col leading-none">
            <span className="text-5xl font-extrabold tracking-tight text-white sm:text-6xl">
              Saltline
            </span>
            <span className="mt-2 font-serif text-4xl font-normal italic tracking-normal text-white/85 sm:text-5xl">
              Fishing Forecast
            </span>
          </h1>
          <p className="max-w-md font-serif text-lg italic leading-snug text-white/75">
            Live tide, wind and wave data for your beach or pier, turned into a
            rating for today and the best time to go.
          </p>
          <div className="mt-2 flex w-full flex-col gap-3">
            <Button variant="primary" href="/locations" className="w-full">
              Find your spot
            </Button>
            <Button
              variant="secondary"
              href="/register"
              className="w-full border-white/20 bg-white/10 text-white hover:border-white/40"
            >
              Create free account
            </Button>
          </div>
        </div>

        <h2 className="sr-only">Why Saltline</h2>
        <div className="mx-auto mt-14 grid max-w-4xl gap-3 text-left sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="flex gap-3 rounded-lg border border-white/10 bg-[#0d1f38]/80 p-4"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className={`mt-0.5 shrink-0 ${feature.color}`}
              >
                {feature.icon}
              </svg>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-white">
                  {feature.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[#a9c4d8]">{feature.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Container>
        <section aria-labelledby="popular-spots-heading" className="mx-auto flex max-w-xl flex-col gap-3 py-10 pb-16">
          <h2 id="popular-spots-heading" className="section-label">
            Popular spots
          </h2>
          <div className="flex flex-col gap-2.5">
            {POPULAR_SPOTS.map((spot) => (
              <a
                key={spot.id}
                href={`/share/${spot.id}`}
                className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3.5 text-text no-underline shadow-card transition-colors hover:border-primary"
              >
                <span className="flex items-center gap-2 font-semibold">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="text-primary">
                    <circle cx="12" cy="10" r="3" />
                    <path d="M12 2a8 8 0 0 0-8 8c0 5.4 7.1 11.5 7.4 11.8a1 1 0 0 0 1.2 0C12.9 21.5 20 15.4 20 10a8 8 0 0 0-8-8z" />
                  </svg>
                  {spot.label}
                </span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-text-muted" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 6 L15 12 L9 18" />
                </svg>
              </a>
            ))}
          </div>
        </section>
      </Container>
    </main>
  )
}
