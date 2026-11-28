'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, Field } from '@/app/components/ui'
import { authClient } from '@/lib/auth-client'
import { clearOfflinePages } from '@/lib/offline-cache'
import type { SocialProviderId } from '@/lib/social-providers'

const PROVIDER_NAME: Record<SocialProviderId, string> = { google: 'Google', apple: 'Apple' }
const linkedNames = (linked: Partial<Record<SocialProviderId, string>>) =>
  (Object.keys(linked) as SocialProviderId[]).map((id) => PROVIDER_NAME[id])

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
  devices,
  hasPassword,
  linkedProviders,
  availableProviders,
  emailVerified,
  emailEnabled,
  changeEmailEnabled,
}: {
  name: string
  email: string
  /** Signed-in devices, this one first; `null` when unknown. */
  devices: Device[] | null
  /** Signs in with email + password (false: Google/Apple only). */
  hasPassword: boolean
  /** Connected Google/Apple sign-ins: provider -> Better Auth account id. */
  linkedProviders: Partial<Record<SocialProviderId, string>>
  /** Google/Apple sign-in configured on this server. */
  availableProviders: SocialProviderId[]
  emailVerified: boolean
  /** This server sends email (SMTP configured). */
  emailEnabled: boolean
  changeEmailEnabled: boolean
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
    // No password (Google/Apple only): Better Auth instead requires a
    // recent sign-in (within a day).
    const { error: deleteError } = await authClient.deleteUser(hasPassword ? { password } : {})
    setIsDeleting(false)
    if (deleteError) {
      setError(
        deleteError.code === 'SESSION_EXPIRED'
          ? 'For your safety, log out and sign in again, then delete your account.'
          : (deleteError.message ?? 'Could not delete your account.'),
      )
      return
    }
    await clearOfflinePages()
    router.push('/')
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      <ProfileCard name={name} email={email} />
      {emailEnabled && <EmailCard email={email} verified={emailVerified} canChange={changeEmailEnabled} />}
      {availableProviders.length > 0 && (
        <SignInMethodsCard hasPassword={hasPassword} linked={linkedProviders} available={availableProviders} />
      )}
      {hasPassword ? (
        <PasswordCard />
      ) : (
        <Card className="flex flex-col gap-1">
          <h2 className="font-semibold text-text">Password</h2>
          <p className="text-sm text-text-muted">
            You sign in with {linkedNames(linkedProviders).join(' or ') || 'Google or Apple'}, so this
            account has no password.
            {/* A reset creates the missing password (Better Auth), but it's emailed. */}
            {emailEnabled && <> To add one, log out and use “Forgot password?” with {email}.</>}
          </p>
        </Card>
      )}
      <DevicesCard devices={devices} />

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
            {hasPassword ? (
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
            ) : (
              <>
                <p className="text-sm text-text">Are you sure? Everything above goes with it.</p>
                {error && (
                  <p role="alert" className="text-sm text-text">
                    {error}
                  </p>
                )}
              </>
            )}
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

type Device = { id: string; label: string; lastActive: string; current: boolean }

const dayFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

/** Your signed-in devices, each with its own sign-out, plus "Sign out
 * everywhere else": for a lost phone or a shared computer. */
function DevicesCard({ devices: initial }: { devices: Device[] | null }) {
  const [devices, setDevices] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const others = devices?.filter((device) => !device.current) ?? null

  async function signOutOne(id: string) {
    setBusy(id)
    setError(null)
    const response = await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => null)
    setBusy(null)
    if (!response || (!response.ok && response.status !== 404)) {
      setError('Could not sign out that device. Try again.')
      return
    }
    setDevices((current) => current?.filter((device) => device.id !== id) ?? null)
  }

  async function signOutOthers() {
    setBusy('all')
    setError(null)
    const { error: revokeError } = await authClient.revokeOtherSessions()
    setBusy(null)
    if (revokeError) {
      setError('Could not sign out your other devices. Try again.')
      return
    }
    setDevices((current) => current?.filter((device) => device.current) ?? null)
    setDone(true)
  }

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="font-semibold text-text">Signed-in devices</h2>
        <p className="mt-1 text-sm text-text-muted">
          {others === null
            ? 'Lost a phone or used a shared computer? Sign out everywhere except here.'
            : others.length === 0
              ? 'You’re signed in only on this device.'
              : 'Don’t recognize one? Sign it out, then change your password.'}
        </p>
      </div>
      {devices && devices.length > 0 && (
        <ul className="flex flex-col divide-y divide-border">
          {devices.map((device) => (
            <li key={device.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-semibold text-text">{device.label}</p>
                <p className="text-xs text-text-muted">
                  {device.current ? 'This device' : `Last active ${dayFormat.format(new Date(device.lastActive))}`}
                </p>
              </div>
              {!device.current && (
                <Button
                  variant="ghost"
                  onClick={() => signOutOne(device.id)}
                  disabled={busy !== null}
                  aria-label={`Sign out ${device.label}, last active ${dayFormat.format(new Date(device.lastActive))}`}
                >
                  {busy === device.id ? 'Signing out…' : 'Sign out'}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {(others === null || others.length > 1) && (
        <Button variant="secondary" className="w-fit" onClick={signOutOthers} disabled={busy !== null}>
          {busy === 'all' ? 'Signing out…' : 'Sign out everywhere else'}
        </Button>
      )}
      {done && (
        <p role="status" className="text-sm text-text-muted">
          Done. Every other device will need to sign in again.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-text">
          {error}
        </p>
      )}
    </Card>
  )
}

/** Email status and change (only when this server sends email). The
 * change goes through two links: one to the current address to approve
 * it, then one to the new address to confirm it (lib/auth.ts). */
function EmailCard({ email, verified, canChange }: { email: string; verified: boolean; canChange: boolean }) {
  const [resent, setResent] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const [newEmail, setNewEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  async function handleChange(event: React.FormEvent) {
    event.preventDefault()
    const target = newEmail.trim().toLowerCase()
    setError(null)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(target)) return setError('That doesn’t look like an email address.')
    if (target === email.toLowerCase()) return setError('That’s already your email.')
    setStatus('sending')
    const { error: changeError } = await authClient.changeEmail({ newEmail: target, callbackURL: '/account' })
    if (changeError) {
      setStatus('error')
      setError(changeError.message ?? 'Could not start the change. Try again.')
      return
    }
    // A confirmed address approves the change first; an unconfirmed one
    // can't, so the link goes straight to the new address.
    setSentTo(verified ? email : target)
    setStatus('sent')
    setNewEmail('')
  }

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="font-semibold text-text">Email</h2>
        <p className="mt-1 text-sm text-text-muted">
          <span className="font-semibold text-text">{email}</span>{' '}
          {verified ? '· confirmed' : '· not confirmed yet'}
        </p>
      </div>
      {!verified && (
        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            className="w-fit"
            disabled={resent === 'sending' || resent === 'sent'}
            onClick={async () => {
              setResent('sending')
              const { error: sendError } = await authClient.sendVerificationEmail({ email, callbackURL: '/account' })
              setResent(sendError ? 'failed' : 'sent')
            }}
          >
            {resent === 'sending' ? 'Sending…' : resent === 'sent' ? 'Sent' : 'Send the confirmation email'}
          </Button>
          {resent === 'sent' && (
            <p role="status" className="text-sm text-text-muted">
              Sent to {email}. Check spam too.
            </p>
          )}
          {resent === 'failed' && (
            <p role="alert" className="text-sm text-text">
              Couldn&apos;t send it right now. Wait a few minutes and try again.
            </p>
          )}
        </div>
      )}
      {canChange && (
        <form method="post" onSubmit={handleChange} className="flex flex-col gap-3" noValidate>
          <Field
            label="Change to"
            name="new-email"
            type="email"
            autoComplete="email"
            value={newEmail}
            onChange={(event) => {
              setNewEmail(event.target.value)
              setError(null)
            }}
            error={error ?? undefined}
          />
          <Button type="submit" variant="secondary" className="w-fit" disabled={status === 'sending' || !newEmail.trim()}>
            {status === 'sending' ? 'Sending…' : 'Change email'}
          </Button>
          {status === 'sent' && sentTo && (
            <p role="status" className="text-sm text-text-muted">
              {sentTo === email
                ? `Check ${email} for a link to approve the change. After that we'll send a confirmation to the new address, and your email changes when you open it.`
                : `Check ${sentTo} for a confirmation link. Your email changes when you open it.`}
            </p>
          )}
        </form>
      )}
    </Card>
  )
}

/** Google/Apple sign-in on this account: connect one (signs in through
 * the provider, then comes back here) or disconnect it, as long as
 * another way to sign in remains. */
function SignInMethodsCard({
  hasPassword,
  linked,
  available,
}: {
  hasPassword: boolean
  linked: Partial<Record<SocialProviderId, string>>
  available: SocialProviderId[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<SocialProviderId | null>(null)
  const [error, setError] = useState<string | null>(null)
  const methods = (hasPassword ? 1 : 0) + Object.keys(linked).length

  async function connect(provider: SocialProviderId) {
    setBusy(provider)
    setError(null)
    const { error: linkError } = await authClient.linkSocial({ provider, callbackURL: '/account' })
    if (linkError) {
      setBusy(null)
      setError(`Couldn't connect ${PROVIDER_NAME[provider]}. Try again.`)
    }
  }

  async function disconnect(provider: SocialProviderId) {
    setBusy(provider)
    setError(null)
    const accountId = linked[provider]
    if (!accountId) return
    const { error: unlinkError } = await authClient.unlinkAccount({ accountId })
    setBusy(null)
    if (unlinkError) {
      setError(`Couldn't disconnect ${PROVIDER_NAME[provider]}. Try again.`)
      return
    }
    router.refresh()
  }

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="font-semibold text-text">Ways to sign in</h2>
        <p className="mt-1 text-sm text-text-muted">
          {[hasPassword && 'Email and password', ...linkedNames(linked)].filter(Boolean).join(' · ')}
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {available.map((provider) => {
          const isLinked = Boolean(linked[provider])
          return (
            <li key={provider} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-text">{PROVIDER_NAME[provider]}</span>
              {isLinked ? (
                <Button
                  variant="ghost"
                  onClick={() => disconnect(provider)}
                  // Never remove the last way to sign in.
                  disabled={busy !== null || methods <= 1}
                >
                  {busy === provider ? 'Disconnecting…' : 'Disconnect'}
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => connect(provider)} disabled={busy !== null}>
                  {busy === provider ? 'Opening…' : `Connect ${PROVIDER_NAME[provider]}`}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-text">
          {error}
        </p>
      )}
    </Card>
  )
}
