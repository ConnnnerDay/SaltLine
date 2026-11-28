import { createHash } from 'node:crypto'

/**
 * Rejects passwords already exposed in data breaches (NIST SP 800-63B
 * asks for this), using Have I Been Pwned's k-anonymity range API: only
 * the first 5 characters of the password's SHA-1 hash leave the server,
 * never the password or its full hash.
 *
 * Fails *open*: if the service is slow or unreachable this returns
 * `null` and the password is allowed, so an outage elsewhere can never
 * block sign-ups or password changes (Better Auth's own haveIBeenPwned
 * plugin fails closed, which is why it isn't used). Turn the check off
 * entirely with PASSWORD_BREACH_CHECK=0.
 */
export const breachCheckEnabled = process.env.PASSWORD_BREACH_CHECK !== '0'

const RANGE_URL = 'https://api.pwnedpasswords.com/range/'
// A hanging service costs sign-up at most this long; normally ~50-150 ms.
const TIMEOUT_MS = 1500

export async function isPasswordBreached(
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean | null> {
  const hash = createHash('sha1').update(password).digest('hex').toUpperCase()
  const prefix = hash.slice(0, 5)
  const suffix = hash.slice(5)
  try {
    const response = await fetchImpl(RANGE_URL + prefix, {
      // Padding hides how many real matches the prefix has.
      headers: { 'Add-Padding': 'true', 'User-Agent': 'Saltline password check' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) return null
    const body = await response.text()
    for (const line of body.split(/\r?\n/)) {
      const [candidate, count] = line.split(':')
      if (candidate?.trim().toUpperCase() === suffix) return Number(count) > 0
    }
    return false
  } catch {
    return null
  }
}
