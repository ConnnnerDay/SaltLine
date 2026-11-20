/**
 * Wall-clock times at a spot. A catch logged for the Outer Banks at
 * "1:30 PM" means 1:30 PM there, whatever time zone the phone is in, so
 * the log form reads and writes `datetime-local` values in the spot's
 * IANA zone rather than the browser's. With no zone, the browser's.
 */

function parts(date: Date, timeZone?: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const part of new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)) {
    if (part.type !== 'literal') out[part.type] = Number(part.value)
  }
  return out
}

const pad = (n: number) => String(n).padStart(2, '0')

/** "2026-11-19T13:30": the wall-clock time at `date` in `timeZone`. */
export function wallClock(date: Date, timeZone?: string | null): string {
  const p = parts(date, timeZone ?? undefined)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

/** The instant a `datetime-local` value means in `timeZone`, as ISO. */
export function wallClockToIso(local: string, timeZone?: string | null): string {
  if (!timeZone) return new Date(local).toISOString()
  const [date, time] = local.split('T')
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const asUtc = Date.UTC(y, mo - 1, d, h, mi)
  // The zone's offset at that moment, applied twice so a time near a DST
  // change lands on the right side of it.
  const offsetAt = (ms: number) => {
    const p = parts(new Date(ms), timeZone)
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - ms
  }
  let ms = asUtc - offsetAt(asUtc)
  ms = asUtc - offsetAt(ms)
  return new Date(ms).toISOString()
}
