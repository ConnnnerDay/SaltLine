/**
 * A small in-memory fixed-window counter: "at most `max` per `windowMs`
 * per key". Per server process, which fits the single-process home
 * install; a multi-instance deployment needs a shared store (or the
 * hosting platform's own firewall) for limits to hold across instances.
 * Bounded: expired entries are swept, and the map never grows past
 * MAX_KEYS (oldest dropped), so a flood of new keys can't exhaust memory.
 */
const MAX_KEYS = 50_000

export class FixedWindow {
  private hits = new Map<string, { count: number; resetAt: number }>()
  private lastSweep = 0

  constructor(
    readonly max: number,
    readonly windowMs: number,
  ) {}

  /** Counts a hit; returns how many seconds to wait when over the limit. */
  hit(key: string, now = Date.now()): number | null {
    this.sweep(now)
    const entry = this.hits.get(key)
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs })
      return null
    }
    entry.count += 1
    return entry.count > this.max ? Math.ceil((entry.resetAt - now) / 1000) : null
  }

  /** Seconds left while `key` is over the limit, without counting a hit. */
  blocked(key: string, now = Date.now()): number | null {
    const entry = this.hits.get(key)
    return entry && entry.resetAt > now && entry.count >= this.max
      ? Math.ceil((entry.resetAt - now) / 1000)
      : null
  }

  reset(key: string): void {
    this.hits.delete(key)
  }

  private sweep(now: number) {
    if (now - this.lastSweep > 60_000) {
      this.lastSweep = now
      for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key)
    }
    while (this.hits.size >= MAX_KEYS) {
      const oldest = this.hits.keys().next().value
      if (oldest === undefined) break
      this.hits.delete(oldest)
    }
  }
}
