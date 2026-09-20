/**
 * Applies Better Auth's own schema migration plan against DATABASE_URL's
 * `auth` schema (see lib/auth.ts's docstring). Deliberately not
 * `@better-auth/cli`'s `migrate` command: at install time, that package
 * pulled in its own separately-vendored, older `better-auth` (<=1.6.21)
 * with several unpatched critical CVEs -- all in OAuth/OIDC/magic-link/
 * organization-plugin code paths this app doesn't enable, so unreachable
 * in practice, but "no fix available" and a dev-only tool is still worth
 * avoiding rather than accepting when the fix is this direct: `better-
 * auth/db`'s own `getMigrations` (the same function the CLI calls
 * internally) is reachable straight from `better-auth/db/migration`, the
 * already-installed, current `better-auth`'s own public export, with
 * zero extra dependencies.
 *
 *     npm run migrate:auth
 */
import { getMigrations } from 'better-auth/db/migration'
import { auth } from '../lib/auth'

async function main() {
  const { toBeCreated, toBeAdded, runMigrations, compileMigrations } = await getMigrations(
    auth.options,
  )

  if (toBeCreated.length === 0 && toBeAdded.length === 0) {
    console.log('auth schema is already up to date, nothing to migrate.')
    return
  }

  console.log(await compileMigrations())
  await runMigrations()
  console.log(
    `migrated: ${toBeCreated.length} table(s) created, ${toBeAdded.length} table(s) altered.`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
