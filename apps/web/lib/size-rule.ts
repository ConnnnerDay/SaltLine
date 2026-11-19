/**
 * Reading a state's size limit (apps/api's regulation snapshot, written as
 * text like "18 in TL", "14–30 in TL (slot limit)", "No minimum", "N/A —
 * prohibited species") into numbers, so "Can I keep it?" can check a
 * measured fish. Anything we can't read with confidence comes back as
 * `unknown`, and the checker says to look at the state's rules instead of
 * guessing.
 */

export type SizeRule =
  | { kind: 'size'; min: number; max: number | null; measure: Measure; varies: boolean }
  | { kind: 'none' }
  | { kind: 'prohibited' }
  | { kind: 'unknown' }

export type Measure = 'TL' | 'FL' | 'LJFL' | 'CFL' | 'CL' | 'CW' | 'mantle' | 'other'

type RuleText = { min_size: string | null; bag_limit?: string | null; notes?: string | null }

const NUM = String.raw`(\d+(?:\.\d+)?)`

function measureOf(text: string): Measure {
  if (/lower jaw fork|LJFL/i.test(text)) return 'LJFL'
  if (/curved fork/i.test(text)) return 'CFL'
  if (/\bFL\b|fork/i.test(text)) return 'FL'
  if (/\bCL\b|carapace length/i.test(text)) return 'CL'
  if (/\bCW\b|carapace width/i.test(text)) return 'CW'
  if (/mantle/i.test(text)) return 'mantle'
  if (/\bTL\b|total length/i.test(text) || /^\s*$/.test(text)) return 'TL'
  if (/^\s*\(/.test(text)) return 'TL'
  return 'other'
}

export function parseSizeRule(rule: RuleText): SizeRule {
  const text = (rule.min_size ?? '').trim()
  const bag = (rule.bag_limit ?? '').trim()
  // A tag lets you keep one ("0 (tag required to harvest)"), so that's not
  // a "can't keep it"; send the angler to the rules instead.
  if (/tag required/i.test(bag)) return { kind: 'unknown' }
  if (/prohibit|protected|no retention|catch.and.release only/i.test(`${text} ${bag}`) || /^0\b/.test(bag)) {
    // "N/A — prohibited in some states" is about other states, not this one.
    if (!/in some states/i.test(text)) return { kind: 'prohibited' }
    return { kind: 'unknown' }
  }
  if (/^(none|no minimum)/i.test(text)) {
    // "None for mahi; varies for billfish" and friends aren't a clean "no limit".
    return /varies|;/i.test(text) ? { kind: 'unknown' } : { kind: 'none' }
  }
  const match = text.match(new RegExp(String.raw`^${NUM}(?:\s*[–-]\s*${NUM})?\s*in\b(.*)$`, 'i'))
  if (!match) return { kind: 'unknown' }
  const [, low, high, rest] = match
  let max = high ? Number(high) : null
  // A slot stated in the notes: "Slot limit: 18–27 in TL." (only when the
  // note leads with it, so "a slot limit may apply" doesn't count).
  const slot = (rule.notes ?? '').match(new RegExp(String.raw`^Slot limit:\s*${NUM}\s*[–-]\s*${NUM}\s*in`, 'i'))
  if (max === null && slot && Number(slot[1]) === Number(low)) max = Number(slot[2])
  return {
    kind: 'size',
    min: Number(low),
    max,
    measure: measureOf(rest),
    // Different numbers by area: worth a "check your area" line.
    varies: /varies|;|\bmost areas\b|\bin (?:Atlantic|Gulf)\b|north of|\bslot limits? may\b/i.test(`${rest} ${rule.notes ?? ''}`),
  }
}

/** How to measure for each kind of length, in a phrase. */
export const MEASURE_HOW: Record<Measure, string> = {
  TL: 'Total length: tip of the closed mouth to the tip of the tail, with the tail lobes pinched together.',
  FL: 'Fork length: tip of the snout to the fork in the tail.',
  LJFL: 'Lower jaw fork length: tip of the lower jaw to the fork in the tail.',
  CFL: 'Curved fork length: along the curve of the body, from the snout to the fork in the tail.',
  CL: 'Carapace length: from the eye socket straight back to the end of the body shell.',
  CW: 'Carapace width: straight across the shell at its widest point, spine tip to spine tip.',
  mantle: 'Mantle length: the body tube, from its tip to its edge by the eyes.',
  other: 'Measure the way your state’s rules describe.',
}

/** The size limit to show in a list or table. When the slot's upper end
 * is only in the notes ("18 in TL" + "Slot limit: 18–27 in TL"), show the
 * whole slot, so the table agrees with "Can I keep it?". */
export function sizeText(rule: RuleText): string | null {
  const parsed = parseSizeRule(rule)
  const text = rule.min_size
  if (parsed.kind !== 'size' || parsed.max === null || !text || /[–-]/.test(text)) return text
  const measure = text.match(/\bin\b\s*(.*)$/i)?.[1]?.trim() ?? ''
  return `${parsed.min}–${parsed.max} in ${measure} slot`.replace(/\s+/g, ' ')
}
