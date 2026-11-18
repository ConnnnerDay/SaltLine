import speciesPhotos from '@/lib/species-photos.json'
import { cx } from './ui/cx'

type SpeciesPhoto = {
  src: string
  credit: string
  license: string
  license_url: string
  source_url: string
}

export const SPECIES_PHOTOS = speciesPhotos as Record<string, SpeciesPhoto>

/**
 * A species photo -- self-hosted from public/species for the hand-picked
 * fish, linked from iNaturalist for the rest (apps/api's
 * scripts/fetch_species_photos.py; free / Creative Commons licenses only)
 * -- always with its author/license credit linked to the source page, the
 * attribution those licenses require.
 */
export function SpeciesPhotoFigure({ id, name, compact = false }: { id: string; name: string; compact?: boolean }) {
  const photo = SPECIES_PHOTOS[id]
  if (!photo) return null
  return (
    <figure className="flex flex-col gap-1.5">
      {/* Every frame is the same shape: the photo is shown whole
          (contain) over a blurred, dimmed copy of itself, so a wide
          croaker and a tall surfperch both fill the frame without being
          cropped or letterboxed in mismatched colors. */}
      <div
        className={cx(
          'relative overflow-hidden rounded-md bg-bg',
          compact ? 'aspect-[16/10]' : 'aspect-[16/10] sm:max-w-xs',
        )}
      >
        <img
          src={photo.src}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="absolute inset-0 h-full w-full scale-125 object-cover opacity-50 blur-xl"
        />
        <img
          src={photo.src}
          alt={name}
          loading="lazy"
          width={480}
          height={300}
          className="relative h-full w-full object-contain drop-shadow-[0_4px_12px_rgb(0_0_0/35%)]"
        />
      </div>
      <figcaption className="truncate px-1 text-[0.6875rem] text-text-muted">
        <a
          href={photo.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-2 hover:underline"
        >
          Photo: {photo.credit} · {photo.license}
        </a>
      </figcaption>
    </figure>
  )
}

