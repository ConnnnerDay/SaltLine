'use client'

import { createAuthClient } from 'better-auth/react'

/**
 * Client-side Better Auth handle for Client Components (forms, session
 * state in the header). Talks to app/api/auth/[...all]/route.ts on the
 * same origin -- no baseURL needed, matching Better Auth's same-origin
 * default.
 */
export const authClient = createAuthClient()

export const { signIn, signUp, signOut, useSession } = authClient
