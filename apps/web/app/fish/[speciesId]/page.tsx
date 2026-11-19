import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { Card, Container } from '@/app/components/ui'
import { cx } from '@/app/components/ui/cx'
import { SpeciesPhotoFigure } from '@/app/components/species-photo'
import { auth } from '@/lib/auth'
import { InternalApiError, internalApiFetch } from '@/lib/internal-api-client'
import type { Preferences } from '@/app/api/preferences/route'
import { ACCESS_LABEL, MONTH_NAMES, REGION_LABEL, TARGET_LABEL, monthSpan, seasonOf, spawningIn, type FishDetail } from '@/lib/fish'
import { localizeText, temp, type Units } from '@/lib/units'
import { FavoriteButton } from '../favorite-button'
import { BestSpots } from './best-spots'
import { Suspense } from 'react'
import type { SavedLocation } from '@/app/api/saved-locations/route'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ speciesId: string }> }

const ACCESS_NOTE: Record<FishDetail['access'], string> = {
  shore: 'Caught from the beach, pier, jetty or bridge.',
  boat: 'Mostly a boat fish: shows up in "What’s biting" if your profile says you fish from a boat.',
  tidal: 'Lives in brackish creeks and rivers: shows up for kayak, wading, bridge and inshore-boat anglers.',
  incidental: 'Bait fish or not a hook-and-line target: listed here, never suggested as a pick.',
}

function Fact({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-bold uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="text-sm leading-relaxed text-text">{value}</dd>
    </div>
  )
}

/** One fish from the Fish guide: photo, seasons, how to catch it, and its
 * size and bag limits in every state the snapshot covers. */
export default async function FishDetailPage({ params }: Props) {
  const { speciesId } = await params
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect(`/login?next=${encodeURIComponent(`/fish/${speciesId}`)}`)
  const userId = session.user.id

  let fish: FishDetail
  try {
    fish = await internalApiFetch<FishDetail>(`/v1/species/${encodeURIComponent(speciesId)}`)
  } catch (err) {
    if (err instanceof InternalApiError && err.status === 404) notFound()
    throw err
  }
  const [prefs, locations, saved] = await Promise.all([
    internalApiFetch<Preferences>('/v1/me/preferences', { userId }).catch(() => null),
    internalApiFetch<{ id: string; state: string }[]>('/v1/locations').catch(() => []),
    internalApiFetch<SavedLocation[]>('/v1/me/locations', { userId }).catch(() => [] as SavedLocation[]),
  ])
  const spotIds = [
    ...new Set([prefs?.default_location_id, ...saved.map((spot) => spot.location_id)].filter(Boolean)),
  ] as string[]
  const units: Units = prefs?.units ?? 'imperial'
  const say = (text: string) => localizeText(text, units)
  const homeState = locations.find((spot) => spot.id === prefs?.default_location_id)?.state ?? null
  const month = new Date().getMonth() + 1
  const now = seasonOf(fish, month)
  const regulations = [...fish.regulations].sort(
    (a, b) => Number(b.state === homeState) - Number(a.state === homeState) || a.state.localeCompare(b.state),
  )

  return (
    <main>
      <Container>
        <div className="mx-auto flex max-w-4xl flex-col gap-5 py-8 pb-16 sm:py-12">
          <Link href="/fish" className="w-fit text-sm font-semibold no-underline">
            ← Fish guide
          </Link>

          <header className="flex flex-col gap-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h1 className="text-3xl font-bold text-text sm:text-4xl">{fish.name}</h1>
              <FavoriteButton speciesId={fish.id} initial={prefs?.favorite_species ?? []} />
            </div>
            <p className="flex flex-wrap items-center gap-1.5 text-xs">
              <span
                className={cx(
                  'rounded-full px-2.5 py-1 font-bold',
                  now === 'peak' && 'bg-accent-tint text-accent',
                  now === 'good' && 'bg-primary-tint text-primary',
                  now === 'off' && 'bg-border text-text-muted',
                )}
              >
                {now === 'peak' ? `Peak in ${MONTH_NAMES[month - 1]}` : now === 'good' ? `In season in ${MONTH_NAMES[month - 1]}` : `Off season in ${MONTH_NAMES[month - 1]}`}
              </span>
              <span className="rounded-full border border-border px-2.5 py-1 font-semibold text-text-muted">
                {ACCESS_LABEL[fish.access]}
              </span>
              {fish.targets.map((target) => (
                <span key={target} className="rounded-full border border-border px-2.5 py-1 font-semibold text-text-muted">
                  {TARGET_LABEL[target] ?? target}
                </span>
              ))}
            </p>
          </header>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,22rem)_1fr]">
            <div className="flex flex-col gap-4">
              <SpeciesPhotoFigure id={fish.id} name={fish.name} compact />
              <Card className="flex flex-col gap-3">
                <h2 className="section-label">Where &amp; when</h2>
                <p className="text-sm text-text">
                  {fish.regions.map((key) => REGION_LABEL[key] ?? key).join(' · ')}
                </p>
                <p className="text-xs text-text-muted">{ACCESS_NOTE[fish.access]}</p>
                <div>
                  <div className="grid grid-cols-12 gap-0.5" aria-hidden="true">
                    {MONTH_NAMES.map((name, index) => {
                      const level = seasonOf(fish, index + 1)
                      return (
                        <span
                          key={name}
                          className={cx(
                            'h-5 rounded-sm',
                            level === 'peak' && 'bg-tier-prime',
                            level === 'good' && 'bg-tier-high',
                            level === 'off' && 'bg-tier-low',
                            index + 1 === month && 'ring-2 ring-text',
                          )}
                        />
                      )
                    })}
                  </div>
                  <div className="mt-1 grid grid-cols-12 text-center text-[0.625rem] text-text-muted" aria-hidden="true">
                    {MONTH_NAMES.map((name) => (
                      <span key={name}>{name[0]}</span>
                    ))}
                  </div>
                  <p className="sr-only">
                    Peak: {fish.peak_months.map((m) => MONTH_NAMES[m - 1]).join(', ') || 'none'}. Good:{' '}
                    {fish.good_months.map((m) => MONTH_NAMES[m - 1]).join(', ') || 'none'}.
                  </p>
                  <p className="mt-2 flex gap-3 text-xs text-text-muted">
                    <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-tier-prime" /> Peak</span>
                    <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-tier-high" /> Good</span>
                  </p>
                </div>
                <dl className="grid grid-cols-2 gap-3">
                  <Fact label="Best water" value={`${temp(fish.temp_ideal_low, units)}–${temp(fish.temp_ideal_high, units)}`} />
                  <Fact label="Found in" value={`${temp(fish.temp_min, units)}–${temp(fish.temp_max, units)}`} />
                </dl>
                {fish.spawn && (
                  <div className="flex flex-col gap-1 border-t border-border pt-3">
                    <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text">
                      Spawning
                      <span className="font-normal text-text-muted">
                        {monthSpan(fish.spawn.months)} · {temp(fish.spawn.temp_low, units)}–{temp(fish.spawn.temp_high, units)} water
                      </span>
                      {spawningIn(fish, month) && (
                        <span className="rounded-full bg-marginal-bg px-2 py-0.5 text-xs font-bold text-marginal-text">Spawning now</span>
                      )}
                    </h3>
                    <p className="text-xs leading-relaxed text-text-muted">{say(fish.spawn.note)}</p>
                  </div>
                )}
              </Card>
            </div>

            <div className="flex flex-col gap-4">
              <Card className="flex flex-col gap-4">
                <h2 className="section-label">How to catch it</h2>
                <dl className="flex flex-col gap-3">
                  <Fact label="Bait" value={say(fish.bait)} />
                  <Fact label="Rig" value={say(fish.rig)} />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Fact label="Hook" value={say(fish.hook_size)} />
                    <Fact label="Sinker" value={say(fish.sinker)} />
                  </div>
                  <Fact label="Lures" value={say(fish.lures)} />
                </dl>
              </Card>
              <Card className="flex flex-col gap-3">
                <h2 className="section-label">What they&apos;re doing</h2>
                <p className="text-sm leading-relaxed text-text">
                  <span className="font-semibold">Warm water: </span>
                  {say(fish.explanation_warm)}
                </p>
                <p className="text-sm leading-relaxed text-text">
                  <span className="font-semibold">Cool water: </span>
                  {say(fish.explanation_cold)}
                </p>
              </Card>
            </div>
          </div>

          {fish.access !== 'incidental' && (
            <Suspense
              fallback={
                <Card className="flex flex-col gap-2">
                  <h2 className="section-label">Best of your spots today</h2>
                  <p className="text-sm text-text-muted">Checking today&apos;s conditions at your spots…</p>
                </Card>
              }
            >
              <BestSpots speciesId={fish.id} name={fish.name} spotIds={spotIds.slice(0, 12)} units={units} />
            </Suspense>
          )}

          <Card className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="section-label">Size &amp; bag limits</h2>
              {regulations[0] && (
                <span className="text-xs text-text-muted">
                  Snapshot from {regulations[0].as_of}. Always check the state&apos;s current rules.
                </span>
              )}
            </div>
            {regulations.length === 0 ? (
              <p className="text-sm text-text-muted">
                No state limits on file for this fish. Check your state&apos;s fishing regulations.
              </p>
            ) : (
              <div className="max-w-full overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="text-xs text-text-muted">
                    <tr>
                      <th scope="col" className="py-1.5 pr-3 font-semibold">State</th>
                      <th scope="col" className="py-1.5 pr-3 font-semibold">Size</th>
                      <th scope="col" className="py-1.5 pr-3 font-semibold">Bag</th>
                      <th scope="col" className="py-1.5 pr-3 font-semibold">Season</th>
                      <th scope="col" className="py-1.5 font-semibold"><span className="sr-only">Source</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {regulations.map((rule) => (
                      <tr key={rule.state} className={cx('border-t border-border', rule.state === homeState && 'bg-primary-tint')}>
                        <th scope="row" className="py-2 pr-3 font-bold text-text">
                          {rule.state}
                          {rule.state === homeState && <span className="ml-1.5 text-xs font-semibold text-primary">your state</span>}
                        </th>
                        <td className="py-2 pr-3 text-text">{rule.min_size ? say(rule.min_size) : '—'}</td>
                        <td className="py-2 pr-3 text-text">{rule.bag_limit ? say(rule.bag_limit) : '—'}</td>
                        <td className="py-2 pr-3 text-text-muted">{rule.season ? say(rule.season) : 'Open'}</td>
                        <td className="py-2 text-right">
                          {rule.source_url && (
                            <a href={rule.source_url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold">
                              Official rules ↗
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </Container>
    </main>
  )
}
