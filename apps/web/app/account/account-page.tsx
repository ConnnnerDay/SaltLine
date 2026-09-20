'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, Field } from '@/app/components/ui'
import { authClient } from '@/lib/auth-client'

/**
 * Sprint 45's two pieces: export (a plain download link to
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
export function AccountPage() {
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
      <Card className="flex flex-col gap-3">
        <div>
          <h2 className="font-semibold text-text">Export your data</h2>
          <p className="mt-1 text-sm text-text-muted">
            Download everything Saltline holds for your account -- your profile,
            preferences, and saved locations -- as a JSON file.
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
            Permanently deletes your account, preferences, and saved locations.
            This can't be undone.
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
          <form onSubmit={handleDelete} className="flex flex-col gap-3" noValidate>
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
