import Link from 'next/link'
import { Card } from '@/app/components/ui'
import { SPECIES_PHOTOS } from '@/app/components/species-photo'
import { fishNotes } from '@/lib/fish-id'
import { HandleArt, handleArtFor } from '@/app/components/how-art'

/**
 * "Know it when you land it": the fish this one gets mistaken for and how
 * to tell them apart (with a photo of each, since that's how people
 * check), what on it can hurt you, and what it's like to eat. Nothing
 * renders for a fish we have no notes on.
 */
export function Identify({
  id,
  names,
  say,
}: {
  id: string
  names: Map<string, string>
  say: (text: string) => string
}) {
  const notes = fishNotes(id)
  const lookalikes = (notes.lookalikes ?? []).filter((look) => names.has(look.id))
  const handle = notes.handle ?? []
  if (lookalikes.length === 0 && handle.length === 0 && !notes.table) return null

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="section-label">Know it when you land it</h2>
        {notes.hazards.map((hazard) => (
          <span key={hazard} className="rounded-full border border-marginal-border bg-marginal-bg px-2.5 py-0.5 text-xs font-bold text-marginal-text">
            ⚠ {hazard}
          </span>
        ))}
      </div>

      {lookalikes.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h3 className="text-sm font-bold text-text">Don&apos;t mix it up with</h3>
          <ul className="flex flex-col gap-3">
            {lookalikes.map((look) => {
              const photo = SPECIES_PHOTOS[look.id]
              return (
                <li key={look.id} className="flex gap-3">
                  {photo ? (
                    <Link href={`/fish/${look.id}`} className="shrink-0" aria-hidden="true" tabIndex={-1}>
                      <img
                        src={photo.src}
                        alt=""
                        loading="lazy"
                        title={`Photo: ${photo.credit} (${photo.license})`}
                        className="h-14 w-20 rounded-md bg-bg object-cover"
                      />
                    </Link>
                  ) : (
                    <span className="h-14 w-20 shrink-0 rounded-md bg-bg" aria-hidden="true" />
                  )}
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <Link href={`/fish/${look.id}`} className="w-fit text-sm font-semibold">
                      {names.get(look.id)}
                    </Link>
                    <p className="text-sm leading-relaxed text-text-muted">{say(look.tell)}</p>
                    {photo && <p className="text-[0.6875rem] text-text-muted">Photo: {photo.credit}, {photo.license}</p>}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {handle.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h3 className="text-sm font-bold text-text">Handle with care</h3>
          <ul className="flex flex-col gap-3 text-sm leading-relaxed text-text">
            {handle.map((line) => {
              const art = handleArtFor(line)
              return (
                <li key={line} className={art.length ? 'flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4' : 'flex gap-2'}>
                  {art.length ? (
                    <div className="flex w-full shrink-0 gap-2 sm:w-auto">
                      {art.map((id) => (
                        <div key={id} className="w-full max-w-56 sm:w-44">
                          <HandleArt id={id} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span aria-hidden="true" className="text-marginal-text">•</span>
                  )}
                  <span>{say(line)}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {notes.table && (
        <section className="flex flex-col gap-1.5">
          <h3 className="text-sm font-bold text-text">On the table</h3>
          <p className="text-sm leading-relaxed text-text">{say(notes.table)}</p>
        </section>
      )}
    </Card>
  )
}
