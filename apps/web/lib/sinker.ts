import type { Water } from './fishing-style'

/**
 * How much lead it takes to hold bottom today, from the surf height and
 * wind (the forecast's 24-hour ranges, US units), for each kind of water
 * the angler fishes. Rule-of-thumb bands surf and pier anglers use: more
 * wave and more wind (a bellied line drags the sinker) need more weight,
 * and bigger surf calls for a grip sinker (sputnik / spider) over a
 * plain pyramid. Weights stay in ounces; the page localizes them.
 */

export type SinkerAdvice = {
  water: Water
  weight: string
  kind: string
  why: string
}

const SURF_BANDS: { upTo: number; weight: string; kind: string }[] = [
  { upTo: 1.5, weight: '2–3 oz', kind: 'Pyramid' },
  { upTo: 3, weight: '3–4 oz', kind: 'Pyramid' },
  { upTo: 5, weight: '4–6 oz', kind: 'Sputnik (grip wire) or heavy pyramid' },
  { upTo: Infinity, weight: '6–8 oz', kind: 'Sputnik (grip wire)' },
]

function band(waveFt: number, windy: boolean): number {
  const index = SURF_BANDS.findIndex((entry) => waveFt <= entry.upTo)
  return Math.min(index + (windy ? 1 : 0), SURF_BANDS.length - 1)
}

export function sinkerAdvice(
  waters: Water[],
  waveRangeFt: [number, number] | null | undefined,
  windRangeKt: [number, number] | null | undefined,
): SinkerAdvice[] {
  if (!waveRangeFt && !windRangeKt) return []
  const wave = waveRangeFt?.[1] ?? 2
  const wind = windRangeKt?.[1] ?? 0
  const windy = wind >= 15
  const breezy = wind >= 10
  const conditions = `${waveRangeFt ? `${waveRangeFt[0]}–${waveRangeFt[1]} ft seas` : 'today’s seas'}${windRangeKt ? `, wind up to ${Math.round(wind)} kt` : ''}`
  const list = waters.length > 0 ? waters : (['surf'] as Water[])

  return list
    .filter((water) => water !== 'offshore')
    .map((water): SinkerAdvice => {
      if (water === 'surf' || water === 'pier') {
        const pick = SURF_BANDS[band(wave, windy)]
        const rough = wave > 5
        const why =
          water === 'surf'
            ? `${conditions}. ${windy ? 'The wind bellies your line and drags the sinker, so go one size up. ' : ''}${
                rough
                  ? 'This is hard to hold: fish the trough close in, or try a sound or inlet instead.'
                  : 'If it rolls down the beach, go up an ounce; if it holds easily, go lighter for more bites.'
              }`
            : `${conditions}. Off a pier the current and depth matter as much as the waves: start here and add weight if the bait swings under the pier.${
                windy ? ' A stiff wind bows the line, so keep the rod tip low.' : ''
              }`
        return { water, weight: pick.weight, kind: water === 'pier' && !rough ? 'Pyramid or bank' : pick.kind, why }
      }
      if (water === 'jetty') {
        return {
          water,
          weight: wave > 3 || windy ? '2–4 oz' : '1–2 oz',
          kind: 'Bank or egg sinker on a weak dropper',
          why: `${conditions}. Rocks eat tackle: tie the sinker on lighter line than the main line so a snag costs only the lead.`,
        }
      }
      // Flats and backwater: barely any lead.
      return {
        water,
        weight: windy ? '1/2–1 oz' : breezy ? '1/4–1/2 oz' : '1/8–1/4 oz',
        kind: 'Split shot, small egg sinker or jig head',
        why: `${windRangeKt ? `Wind up to ${Math.round(wind)} kt. ` : ''}Use just enough to keep the bait down in the current${breezy ? ' and wind' : ''}: shallow fish spook at a heavy splash.`,
      }
    })
}
