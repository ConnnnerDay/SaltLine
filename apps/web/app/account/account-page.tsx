'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, Field } from '@/app/components/ui'
import { authClient } from '@/lib/auth-client'

/**
 * Account management: who you're signed in as (and your name), changing
 * your password, signing out other devices, then sprint 45's two pieces: export (a plain download link to
 * app/api/account/export/route.ts -- no client state needed, the
 * browser handles the `Content-Disposition: attachment` response
 * itself) and deletion (this file's one real interactive flow).
 *
 * Deletion is a two-step reveal, not a single button: `showConfirm`
 * gates a second, explicit "Yes, delete my account" action behind
 * typing the current password first -- an irreversible action doesn't
 * get a one-click path. Confirmed via `authClient.deleteUser({
 * password })` (Better Auth's built-in endpoint, enabled in
 * lib/auth.ts, whose `beforeDelete` hook cleans up apps/api's data
 * first); a wrong password surfaces Better Auth's own error message
 * rather than a generic failure.
 */
export function AccountPage({
  name,
  email,
  otherSessions,
}: {
  name: string
  email: string
  /** Signed-in sessions besides this one; `null` when unknown. */
  otherSessions: number | null
}) {
  const router = useRouter()
  const [showConfirm, setShowConfirm] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleDelete(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setIsDeleting(true)
    const { error: deleteError } = await authClient.deleteUser({ password })
    setIsDeleting(false)
    if (deleteError) {
      setError(deleteError.message ?? 'Could not delete your account.')
      return
    }
    router.push('/')
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      <ProfileCard name={name} email={email} />
      <PasswordCard />
      <DevicesCard otherSessions={otherSessions} />

      <Card className="flex flex-col gap-3">
        <div>
          <h2 className="font-semibold text-text">Export your data</h2>
          <p className="mt-1 text-sm text-text-muted">
            Download everything Saltline holds for your account as a JSON file: your
            profile and preferences, saved spots, catch log and email alerts.
          </p>
        </div>
        <Button variant="secondary" href="/api/account/export" className="w-fit">
          Download my data
        </Button>
      </Card>

      <Card className="flex flex-col gap-3">
        <div>
          <h2 className="font-semibold text-text">Delete your account</h2>
          <p className="mt-1 text-sm text-text-muted">
            Permanently deletes your account along with your preferences, saved spots,
            catch log and email alerts. This can&apos;t be undone.
          </p>
        </div>

        {!showConfirm ? (
          <Button
            variant="secondary"
            className="w-fit"
            onClick={() => setShowConfirm(true)}
          >
            Delete my account
          </Button>
        ) : (
          <form method="post" onSubmit={handleDelete} className="flex flex-col gap-3" noValidate>
            <Field
              label="Confirm your password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={error ?? undefined}
            />
            <div className="flex gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowConfirm(false)
                  setPassword('')
                  setError(null)
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isDeleting}>
                {isDeleting ? 'Deleting…' : 'Yes, delete my account'}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  )
}

/** Who you're signed in as, with an editable display name (the name the
 * header's account menu shows). Email changes need a verification flow
 * this app doesn't have yet, so the email is shown, not edited. */
function ProfileCard({ name, email }: { name: string; email: string }) {
  const router = useRouter()
  const [value, setValue] = useState(name)
  const [saved, setSaved] = useState(name)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const trimmed = value.trim()

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    if (!trimmed || trimmed === saved) return
    setStatus('saving')
    const { error } = await authClient.updateUser({ name: trimmed })
    if (error) {
      setStatus('error')
      return
    }
    setSaved(trimmed)
    setValue(trimmed)
    setStatus('saved')
    router.refresh()
  }

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="font-semibold text-text">Your account</h2>
        <p className="mt-1 text-sm text-text-muted">
          Signed in as <span className="font-semibold text-text">{email}</span>
        </p>
      </div>
      <form method="post" onSubmit={handleSave} className="flex flex-col gap-3" noValidate>
        <Field
          label="Name"
          name="name"
          autoComplete="name"
          maxLength={80}
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setStatus('idle')
          }}
          error={
            status === 'error'
              ? 'Could not save your name. Try again.'
              : !trimmed
                ? 'Your name can’t be empty.'
                : undefined
          }
        />
        <div className="flex items-center gap-3">
          <Button
            type="submit"
            variant="secondary"
            className="w-fit"
            disabled={status === 'saving' || !trimmed || trimmed === saved}
          >
            {status === 'saving' ? 'Saving…' : 'Save name'}
          </Button>
          {status === 'saved' && (
            <span role="status" className="text-sm text-text-muted">
              Saved.
            </span>
          )}
        </div>
      </form>
    </Card>
  )
}

/** Change password: the current one, then the new one twice. Signing
 * out other devices is on by default, the safe choice after a change. */
function PasswordCard() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [signOutOthers, setSignOutOthers] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleChange(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setDone(false)
    if (next.length < 8) return setError('Your new password needs at least 8 characters.')
    if (next !== confirm) return setError('The new passwords don’t match.')
    if (next === current) return setError('Pick a password different from your current one.')
    setSaving(true)
    const { error: changeError } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: signOutOthers,
    })
    setSaving(false)
    if (changeError) {
      setError(changeError.message ?? 'Could not change your password.')
      return
    }
    setCurrent('')
    setNext('')
    setConfirm('')
    setDone(true)
  }

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-semibold text-text">Change password</h2>
      <form method="post" onSubmit={handleChange} className="flex flex-col gap-3" noValidate>
        <Field
          label="Current password"
          name="current-password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
        />
        <Field
          label="New password"
          name="new-password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters."
          value={next}
          onChange={(event) => setNext(event.target.value)}
        />
        <Field
          label="Confirm new password"
          name="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          error={error ?? undefined}
        />
        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={signOutOthers}
            onChange={(event) => setSignOutOthers(event.target.checked)}
            className="h-4 w-4 accent-[var(--color-primary)]"
          />
          Sign out my other devices
        </label>
        <div className="flex items-center gap-3">
          <Button
            type="submit"
            variant="secondary"
            className="w-fit"
            disabled={saving || !current || !next || !confirm}
          >
            {saving ? 'Changing…' : 'Change password'}
          </Button>
          {done && (
            <span role="status" className="text-sm text-text-muted">
              Password changed.
            </span>
          )}
        </div>
      </form>
    </Card>
  )
}

/** Signs out every other browser and phone: for a lost phone or a shared
 * computer. This device stays signed in. */
function DevicesCard({ otherSessions }: { otherSessions: number | null }) {
  const [count, setCount] = useState(otherSessions)
  const [status, setStatus] = useState<'idle' | 'working' | 'done' | 'error'>('idle')

  async function handleRevoke() {
    setStatus('working')
    const { error } = await authClient.revokeOtherSessions()
    if (error) {
      setStatus('error')
      return
    }
    setCount(0)
    setStatus('done')
  }

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="font-semibold text-text">Signed-in devices</h2>
        <p className="mt-1 text-sm text-text-muted">
          {count === null
            ? 'Lost a phone or used a shared computer? Sign out everywhere except here.'
            : count === 0
              ? 'You’re signed in only on this device.'
              : `You’re also signed in on ${count} other ${count === 1 ? 'device or browser' : 'devices or browsers'}.`}
        </p>
      </div>
      <Button
        variant="secondary"
        className="w-fit"
        onClick={handleRevoke}
        disabled={status === 'working' || count === 0}
      >
        {status === 'working' ? 'Signing out…' : 'Sign out everywhere else'}
      </Button>
      {status === 'done' && (
        <p role="status" className="text-sm text-text-muted">
          Done. Every other device will need to sign in again.
        </p>
      )}
      {status === 'error' && (
        <p role="alert" className="text-sm text-text">
          Could not sign out your other devices. Try again.
        </p>
      )}
    </Card>
  )
}
