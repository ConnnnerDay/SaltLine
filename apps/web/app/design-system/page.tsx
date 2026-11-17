import { Badge, Button, Card, Container, Field } from '../components/ui'
import { RigDiagram } from '../components/rig-diagram'
import { WeatherAlerts } from '../components/sky'
import { SpotDiagram, SPOTS } from '../components/spot-diagram'
import type { Water } from '@/lib/fishing-style'
import { RIGS, type RigId } from '@/lib/rigs'

/**
 * Sprint 27's design-system gallery, moved off `/` once the Saltline
 * rebrand gave the app a real landing page to put there instead (see
 * `app/page.tsx`). Kept as its own route rather than deleted -- still
 * the fastest way to eyeball every primitive/token together after a
 * palette or type change.
 */
export default function DesignSystemPage() {
  return (
    <main>
      <Container>
        <header className="py-10 sm:py-16">
          <p className="text-sm font-medium tracking-wide text-primary uppercase">
            Internal reference
          </p>
          <h1 className="mt-2 text-4xl font-bold text-text sm:text-5xl">
            Design system
          </h1>
          <p className="mt-3 max-w-prose text-lg text-text-muted">
            Every primitive and token in one place, styled from{' '}
            <code>app/globals.css</code>.
          </p>
        </header>

        <section aria-labelledby="gallery-heading" className="flex flex-col gap-10 pb-16">
          <h2 id="gallery-heading" className="text-2xl font-semibold text-text">
            Components
          </h2>

          <div className="flex flex-col gap-3">
            <h3 className="text-lg font-medium text-text">Weather alerts</h3>
            <p className="text-sm text-text-muted">Sample NWS alerts at each severity (not live data).</p>
            <WeatherAlerts
              timezone="America/New_York"
              alerts={[
                { event: 'Gale Warning', severity: 'Severe', headline: 'Sample: Gale Warning until Wednesday morning', description: 'Sample text. Northeast winds 25 to 35 kt with gusts to 40 kt. Seas 8 to 12 ft.', expires: '2026-11-18T11:00:00-05:00' },
                { event: 'Small Craft Advisory', severity: 'Moderate', headline: 'Sample: Small Craft Advisory until 6 PM', description: 'Sample text. Winds 20 to 25 kt. Seas 5 to 7 ft.', expires: '2026-11-17T18:00:00-05:00' },
                { event: 'Rip Current Statement', severity: 'Minor', headline: 'Sample: High rip current risk', description: 'Sample text. Dangerous rip currents expected.' },
              ]}
            />
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-lg font-medium text-text">Where-to-fish cross-sections</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(Object.keys(SPOTS) as Water[]).map((water) => (
                <Card key={water} className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-text">{SPOTS[water].title}</span>
                  <div className="overflow-hidden rounded-md border border-border">
                    <SpotDiagram water={water} className="block h-auto w-full" />
                  </div>
                </Card>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-lg font-medium text-text">Rig diagrams</h3>
            <p className="text-sm text-text-muted">
              Every rig the &quot;Rigs &amp; tips&quot; section can show (lib/rigs.ts).
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(Object.keys(RIGS) as RigId[]).map((id) => (
                <Card key={id} className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-text">{RIGS[id].name}</span>
                  <div className="rounded-md border border-border bg-bg/60 p-2">
                    <RigDiagram id={id} className="h-auto w-full" />
                  </div>
                </Card>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-lg font-medium text-text">Forecast verdict</h3>
            <p className="text-sm text-text-muted">
              The go/no-go traffic-light dashboard headline — color
              reinforces the verdict, the text label always states it.
            </p>
            <div className="flex flex-wrap gap-3">
              <Badge variant="go">Go</Badge>
              <Badge variant="marginal">Marginal</Badge>
              <Badge variant="nogo">No-go</Badge>
              <Badge variant="neutral">Unavailable</Badge>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-lg font-medium text-text">Buttons</h3>
            <div className="flex flex-wrap gap-3">
              <Button variant="primary">Primary action</Button>
              <Button variant="secondary">Secondary action</Button>
              <Button variant="ghost">Ghost action</Button>
              <Button variant="primary" href="/">
                Link button
              </Button>
              <Button variant="primary" disabled>
                Disabled
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-lg font-medium text-text">Cards</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Card>
                <h4 className="font-semibold text-text">Wrightsville Beach, NC</h4>
                <p className="mt-1 text-sm text-text-muted">
                  A card is a bordered surface for grouping related content —
                  a forecast summary, a saved location, a catch-log entry.
                </p>
              </Card>
              <Card>
                <h4 className="font-semibold text-text">Montauk, NY</h4>
                <p className="mt-1 text-sm text-text-muted">
                  Same primitive, any content. Padding and radius come from
                  the shared design tokens in <code>app/globals.css</code>.
                </p>
              </Card>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-lg font-medium text-text">Form fields</h3>
            <Card className="max-w-sm">
              <Field label="Location name" placeholder="e.g. Wrightsville Beach" />
              <Field
                label="Email"
                type="email"
                hint="Used for account alerts, never shared."
              />
              <Field
                label="Password"
                type="password"
                error="Password must be at least 8 characters."
              />
            </Card>
          </div>
        </section>
      </Container>
    </main>
  )
}
