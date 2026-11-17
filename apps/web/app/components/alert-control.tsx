'use client'

import { useEffect, useId, useState } from 'react'
import type { AlertRule, Alerts } from '@/app/api/alerts/route'

type Choice = 'off' | 'Good' | 'Excellent'

/**
 * "Email me when this spot is Good or better" -- the restored forecast
 * alerts. One alert per spot; at most one email a day, 5 AM-8 PM at the
 * spot, to the account's own address. Warns when the server has no mail
 * settings, since alerts can't be sent until install.sh is given them.
 */
export function AlertControl({ locationId }: { locationId: string }) {
  const selectId = useId()
  const [loaded, setLoaded] = useState(false)
  const [emailConfigured, setEmailConfigured] = useState(true)
  const [rule, setRule] = useState<AlertRule | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/alerts')
      .then((response) => (response.ok ? (response.json() as Promise<Alerts>) : null))
      .then((alerts) => {
        if (cancelled || !alerts) return
        setEmailConfigured(alerts.email_configured)
        setRule(alerts.rules.find((candidate) => candidate.location_id === locationId) ?? null)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [locationId])

  async function change(choice: Choice) {
    setBusy(true)
    setError(null)
    try {
      if (choice === 'off') {
        if (rule) {
          const response = await fetch(`/api/alerts/${rule.id}`, { method: 'DELETE' })
          if (!response.ok) throw new Error()
        }
        setRule(null)
      } else {
        const response = await fetch('/api/alerts', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ location_id: locationId, min_verdict: choice }),
        })
        if (!response.ok) throw new Error()
        setRule((await response.json()) as AlertRule)
      }
    } catch {
      setError('Could not update the alert. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const current: Choice = rule ? rule.min_verdict : 'off'

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-5 shadow-card sm:p-6">
      <label htmlFor={selectId} className="section-label">
        Email alerts
      </label>
      <select
        id={selectId}
        value={current}
        disabled={!loaded || busy}
        onChange={(event) => change(event.target.value as Choice)}
        className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring sm:w-auto sm:min-w-80 sm:self-start"
      >
        <option value="off">Off</option>
        <option value="Good">Email me when it&apos;s Good or better</option>
        <option value="Excellent">Email me only when it&apos;s Excellent</option>
      </select>
      {rule && (
        <p className="text-xs text-text-muted">
          Sends to {rule.email}, at most once a day, between 5 AM and 8 PM at this spot.
        </p>
      )}
      {loaded && !emailConfigured && (
        <p className="text-xs text-marginal-text">
          Email isn&apos;t set up on this Saltline server yet, so alerts can&apos;t be sent.
          Re-run ./install.sh and enter your mail settings when it asks.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger-text">
          {error}
        </p>
      )}
    </div>
  )
}
