/**
 * Display units. apps/api works (and stores) in US units -- °F, feet,
 * knots, miles, inches, ounces, pounds -- and the profile's `units`
 * preference decides what the reader sees. Conversion happens only at
 * display time, so thresholds and comparisons elsewhere stay in the API's
 * units and nothing is converted twice.
 *
 * Metric shows °C, metres, km/h, km, cm, grams and kilograms. Pressure is
 * already in millibars (hPa) either way.
 *
 * `localizeText` converts unit amounts inside prose: forecast summaries,
 * species reasons, tackle notes and regulations written by apps/api, NWS
 * surf zone text, and the rig how-tos ("Clip a 2–4 oz pyramid sinker").
 */

export type Units = 'imperial' | 'metric'

const F_TO_C = (f: number) => ((f - 32) * 5) / 9
const FT_TO_M = 0.3048
const KT_TO_KMH = 1.852
const MPH_TO_KMH = 1.609344
const MI_TO_KM = 1.609344
const IN_TO_CM = 2.54
const OZ_TO_G = 28.3495
const LB_TO_KG = 0.453592

/** A sensible number of decimals for a converted value. */
function tidy(value: number, decimals: number): string {
  const fixed = value.toFixed(decimals)
  return decimals > 0 ? fixed.replace(/\.0+$/, '') : fixed
}

function metresDecimals(m: number): number {
  return Math.abs(m) < 10 ? 1 : 0
}

// ---------- numbers ----------

/** 63.2 -> "63°F" / "17°C" (pass decimals to keep tenths). */
export function temp(f: number, units: Units, decimals = 0): string {
  return units === 'metric' ? `${F_TO_C(f).toFixed(decimals)}°C` : `${f.toFixed(decimals)}°F`
}

/** A bare temperature number with a degree sign, no letter ("63°"). */
export function degrees(f: number, units: Units): string {
  return `${Math.round(units === 'metric' ? F_TO_C(f) : f)}°`
}

/** A temperature *difference* in °F (no 32° offset): 3 -> "3°F" / "2°C". */
export function tempDelta(deltaF: number, units: Units, decimals = 0): string {
  return units === 'metric'
    ? `${((deltaF * 5) / 9).toFixed(decimals)}°C`
    : `${deltaF.toFixed(decimals)}°F`
}

/** 3.3 -> "3.3 ft" / "1 m" (feet keep the decimals you ask for). */
export function height(ft: number, units: Units, decimals = 1): string {
  if (units === 'metric') {
    const m = ft * FT_TO_M
    return `${tidy(m, metresDecimals(m))} m`
  }
  return `${ft.toFixed(decimals)} ft`
}

function formatPair(low: string, high: string): string {
  return low === high ? low : `${low}–${high}`
}

/** [2, 4] -> "2–4 ft" / "0.6–1.2 m" (feet rounded to `step`). */
export function heightRange([low, high]: [number, number], units: Units, step = 0.5): string {
  if (units === 'metric') {
    const a = low * FT_TO_M
    const b = high * FT_TO_M
    return `${formatPair(tidy(a, metresDecimals(b)), tidy(b, metresDecimals(b)))} m`
  }
  const round = (v: number) => tidy(Math.round(v / step) * step, step < 1 ? 1 : 0)
  return `${formatPair(round(low), round(high))} ft`
}

/** [10, 20] -> "10–20 kt" / "19–37 km/h". */
export function speedRange([low, high]: [number, number], units: Units): string {
  if (units === 'metric') {
    return `${formatPair(String(Math.round(low * KT_TO_KMH)), String(Math.round(high * KT_TO_KMH)))} km/h`
  }
  return `${formatPair(String(Math.round(low)), String(Math.round(high)))} kt`
}

/** A wind speed in knots -> "15 kt" / "28 km/h". */
export function speed(kt: number, units: Units): string {
  return units === 'metric' ? `${Math.round(kt * KT_TO_KMH)} km/h` : `${Math.round(kt)} kt`
}

/** A water current in knots -> "1.8 kt" / "3.3 km/h": one decimal, since
 * currents are slow and 1.8 vs 2.2 kt matters. */
export function currentSpeed(kt: number, units: Units): string {
  return units === 'metric' ? `${tidy(kt * KT_TO_KMH, 1)} km/h` : `${tidy(kt, 1)} kt`
}

/** Miles -> "9.6 mi" / "15 km" (one decimal under 10). */
export function distance(mi: number, units: Units): string {
  const value = units === 'metric' ? mi * MI_TO_KM : mi
  const text = value < 10 ? tidy(value, 1) : String(Math.round(value))
  return `${text} ${units === 'metric' ? 'km' : 'mi'}`
}

/** Inches -> "18 in" / "46 cm". */
export function length(inches: number, units: Units): string {
  return units === 'metric' ? `${Math.round(inches * IN_TO_CM)} cm` : `${tidy(inches, 1)} in`
}

/** Pounds -> "4.5 lb" / "2 kg". */
export function weight(lb: number, units: Units): string {
  return units === 'metric' ? `${tidy(lb * LB_TO_KG, 1)} kg` : `${tidy(lb, 1)} lb`
}

/** Unit names for labels and inputs. */
export function unitLabel(
  kind: 'temp' | 'height' | 'speed' | 'distance' | 'weight' | 'length',
  units: Units,
): string {
  const metric = { temp: '°C', height: 'm', speed: 'km/h', distance: 'km', weight: 'kg', length: 'cm' }
  const imperial = { temp: '°F', height: 'ft', speed: 'kt', distance: 'mi', weight: 'lb', length: 'in' }
  return (units === 'metric' ? metric : imperial)[kind]
}

/** Input values: show a stored US value in the reader's units, and turn
 * what they type back into the stored US unit. */
export const toDisplay = {
  height: (ft: number, units: Units) => (units === 'metric' ? +(ft * FT_TO_M).toFixed(1) : ft),
  speed: (kt: number, units: Units) => (units === 'metric' ? Math.round(kt * KT_TO_KMH) : kt),
  weight: (lb: number, units: Units) => (units === 'metric' ? +(lb * LB_TO_KG).toFixed(2) : lb),
  length: (inches: number, units: Units) => (units === 'metric' ? +(inches * IN_TO_CM).toFixed(1) : inches),
}
export const fromDisplay = {
  height: (value: number, units: Units) => (units === 'metric' ? +(value / FT_TO_M).toFixed(2) : value),
  speed: (value: number, units: Units) => (units === 'metric' ? +(value / KT_TO_KMH).toFixed(1) : value),
  weight: (value: number, units: Units) => (units === 'metric' ? +(value / LB_TO_KG).toFixed(2) : value),
  length: (value: number, units: Units) => (units === 'metric' ? +(value / IN_TO_CM).toFixed(2) : value),
}

/** A water-temperature band for grouping catches: 5°F or 3°C wide. */
export function tempBand(f: number, units: Units): { label: string; order: number } {
  if (units === 'metric') {
    const c = F_TO_C(f)
    const low = Math.floor(c / 3) * 3
    return { label: `${low}–${low + 3}°C`, order: low }
  }
  const low = Math.floor(f / 5) * 5
  return { label: `${low}–${low + 5}°F`, order: low }
}

// ---------- prose ----------

// A number: 12, 3.5, or a fraction like 1/4.
const NUM = String.raw`\d+(?:\.\d+)?(?:/\d+)?`
// An optional range: "2-4", "2–4", "2 to 4".
const RANGE = String.raw`(${NUM})(?:(\s*(?:–|-|to)\s*)(${NUM}))?`

function parse(value: string): number {
  if (value.includes('/')) {
    const [a, b] = value.split('/').map(Number)
    return b ? a / b : a
  }
  return Number(value)
}

function decimalsOf(value: string): number {
  return value.includes('.') ? 1 : 0
}

type Context = { tempDecimals: number }

type Rule = {
  pattern: RegExp
  convert: (
    low: string,
    high: string | undefined,
    sep: string | undefined,
    extra: string | undefined,
    ctx: Context,
  ) => string
}

/** "a" and an optional "b" (a range), converted by `fn` and joined by the
 * original separator, then `unit`. */
function ranged(
  fn: (value: number, original: string) => string,
  unit: string,
): Rule['convert'] {
  return (low, high, sep) =>
    high !== undefined ? `${fn(parse(low), low)}${sep}${fn(parse(high), high)} ${unit}` : `${fn(parse(low), low)} ${unit}`
}

const METRIC_RULES: Rule[] = [
  {
    // 63°F, 55–75°F, 63 °F
    pattern: new RegExp(String.raw`(-?${NUM})(?:(\s*(?:–|-|to)\s*)(-?${NUM}))?\s*°\s*F\b`, 'g'),
    convert: (low, high, sep, _extra, ctx) => {
      // With a decimal reading in the sentence ("57.7°F is just below
      // 58–74°F"), whole-degree ranges would round to a contradiction
      // ("14.3°C is just below 14–23°C"): keep tenths throughout.
      const c = (v: string) => F_TO_C(parse(v)).toFixed(Math.max(decimalsOf(v), ctx.tempDecimals))
      return high !== undefined ? `${c(low)}${sep}${c(high)}°C` : `${c(low)}°C`
    },
  },
  {
    // "300-800+ ft" keeps its "+".
    pattern: new RegExp(String.raw`${RANGE}(\+?)\s*(?:ft|feet|foot)\b`, 'g'),
    convert: (low, high, sep, plus = '') => {
      const top = parse(high ?? low) * FT_TO_M
      const d = metresDecimals(top)
      const m = (v: string) => tidy(parse(v) * FT_TO_M, d)
      return high !== undefined ? `${m(low)}${sep}${m(high)}${plus} m` : `${m(low)}${plus} m`
    },
  },
  {
    pattern: new RegExp(String.raw`${RANGE}\s*(?:kt|kts|knots?)\b`, 'g'),
    convert: ranged((v) => String(Math.round(v * KT_TO_KMH)), 'km/h'),
  },
  {
    pattern: new RegExp(String.raw`${RANGE}\s*mph\b`, 'g'),
    convert: ranged((v) => String(Math.round(v * MPH_TO_KMH)), 'km/h'),
  },
  {
    pattern: new RegExp(String.raw`${RANGE}\s*(?:mi|miles?)\b`, 'g'),
    convert: ranged((v) => {
      const km = v * MI_TO_KM
      return km < 10 ? tidy(km, 1) : String(Math.round(km))
    }, 'km'),
  },
  {
    // 18 in TL, 12–18 inches, 18" -- "in" only when it's clearly a length.
    pattern: new RegExp(
      // "8-inch" too; "in." mid-sentence ("a 1–2 in. piece") is an
      // abbreviation, so its dot goes with it.
      String.raw`${RANGE}(?:\s*|-)(?:inches|inch|in\.(?=\s+[a-z])|in\b(?=\s*(?:TL|FL|total|fork|long|apart|slot|min|max|minimum|maximum|of\b|or\b|leaders?\b|fluoro|mono\b|wire\b|line\b|pieces?\b|strips?\b|range\b|\(\s*(?:fork|total|curved|lower|carapace|mantle|varies|part\b)|preferred\b|carapace|body\s+length|mantle|point-to-point|CL\b|CW\b|CFL\b|LJFL\b|curved|lower\s+jaw|before\b|are\b|\)|,|;|\.|·|$))|")`,
      'g',
    ),
    convert: ranged((v) => String(Math.round(v * IN_TO_CM)), 'cm'),
  },
  {
    // Sinkers and jig heads: grams, rounded sensibly.
    pattern: new RegExp(String.raw`${RANGE}\s*oz\b`, 'g'),
    convert: ranged((v) => {
      const g = v * OZ_TO_G
      return String(g < 20 ? Math.round(g) : Math.round(g / 5) * 5)
    }, 'g'),
  },
  {
    // Line and leader ratings: "20–30 lb leader" -> kg.
    pattern: new RegExp(String.raw`${RANGE}\s*(?:lbs?|pounds?)\b`, 'g'),
    convert: (low, high, sep) => {
      const d = parse(high ?? low) * LB_TO_KG < 10 ? 1 : 0
      const kg = (v: string) => tidy(parse(v) * LB_TO_KG, d)
      return high !== undefined ? `${kg(low)}${sep}${kg(high)} kg` : `${kg(low)} kg`
    },
  },
]

/** Convert every US-unit amount in a sentence to the reader's units (a
 * no-op for imperial). */
export function localizeText(text: string, units: Units): string {
  if (units !== 'metric' || !text) return text
  const ctx: Context = { tempDecimals: /\d\.\d+\s*°\s*F/.test(text) ? 1 : 0 }
  let out = text
  for (const rule of METRIC_RULES) {
    out = out.replace(
      rule.pattern,
      (_match, low: string, sep: string | undefined, high: string | undefined, extra: unknown) =>
        rule.convert(low, high, sep, typeof extra === 'string' ? extra : undefined, ctx),
    )
  }
  return out
}

/** Every string inside a JSON-like value run through `localizeText`
 * (numbers, keys and structure untouched). For apps/api's forecast
 * envelope, whose prose is written in US units. */
export function localizeDeep<T>(value: T, units: Units): T {
  if (units !== 'metric') return value
  // Identifiers, links and timestamps are never prose.
  const SKIP_KEY = /(^id$|_id$|^ids?$|url|uri|href|^time$|_at$|^as_of$|^start$|^end$|^expires$)/
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') return /^https?:\/\//.test(node) ? node : localizeText(node, units)
    if (Array.isArray(node)) return node.map(walk)
    if (node && typeof node === 'object') {
      return Object.fromEntries(
        Object.entries(node).map(([key, child]) => [key, SKIP_KEY.test(key) ? child : walk(child)]),
      )
    }
    return node
  }
  return walk(value) as T
}
