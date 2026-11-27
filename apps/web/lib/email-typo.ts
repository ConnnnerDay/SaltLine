/**
 * "Did you mean jake@gmail.com?" for common email-domain typos
 * (gmial.com, yahoo.con, hotmial.com) at sign-up: a typo there means the
 * confirmation and any password reset go nowhere. Runs in the browser
 * only; a suggestion, never an automatic change.
 */
const COMMON_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'aol.com',
  'live.com',
  'msn.com',
  'me.com',
  'mac.com',
  'comcast.net',
  'att.net',
  'verizon.net',
  'sbcglobal.net',
  'bellsouth.net',
  'cox.net',
  'charter.net',
  'protonmail.com',
  'proton.me',
  'ymail.com',
]

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const current = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1))
      // Swapped neighbours ("gmial") count as one edit, not two.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        row[j] = Math.min(row[j], previous)
      }
      previous = current
    }
  }
  return row[b.length]
}

/** A corrected address when the domain is a typo or two away from a
 * common one (two only for longer domains), else `null`. */
export function suggestEmail(email: string): string | null {
  const at = email.lastIndexOf('@')
  if (at < 1) return null
  const local = email.slice(0, at)
  const domain = email.slice(at + 1).trim().toLowerCase()
  if (!domain || COMMON_DOMAINS.includes(domain)) return null
  let best: { domain: string; distance: number } | null = null
  for (const candidate of COMMON_DOMAINS) {
    const distance = editDistance(domain, candidate)
    // Two slips only on longer domains: short real ones (att.com, cox.com)
    // are two edits from aol.com.
    const allowed = candidate.length >= 9 ? 2 : 1
    if (distance <= allowed && (!best || distance < best.distance)) best = { domain: candidate, distance }
  }
  return best ? `${local}@${best.domain}` : null
}
