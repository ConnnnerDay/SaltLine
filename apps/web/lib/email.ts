import nodemailer from 'nodemailer'

// Same SMTP_* env var convention CLAUDE.md documents for the retired
// legacy Flask app (SMTP_HOST/PORT/USER/PASS/FROM/USE_TLS) -- reused
// here rather than inventing a second naming scheme for the same
// concept. If unset, this module logs the link instead of sending real
// mail (matching the legacy app's own documented behavior: "if unset,
// accounts auto-confirm and no emails are sent" -- lib/auth.ts reads
// this same SMTP_HOST presence to decide whether email verification is
// required at all, so an unconfigured SMTP_HOST never leaves a real
// user stuck waiting on a link nothing can send).
const SMTP_HOST = process.env.SMTP_HOST
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 587)
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS
const SMTP_FROM = process.env.SMTP_FROM ?? 'Saltline <no-reply@saltline.app>'
const SMTP_USE_TLS = process.env.SMTP_USE_TLS !== '0'

export const smtpConfigured = Boolean(SMTP_HOST)

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null

function getTransporter() {
  if (!SMTP_HOST) return null
  transporter ??= nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    requireTLS: SMTP_USE_TLS && SMTP_PORT !== 465,
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  })
  return transporter
}

async function sendMail(to: string, subject: string, text: string): Promise<void> {
  const transport = getTransporter()
  if (!transport) {
    // Dev fallback -- logs instead of failing, same spirit as the
    // legacy app auto-confirming accounts when SMTP is unconfigured.
    console.info(`[email:dev] to=${to} subject=${JSON.stringify(subject)}\n${text}`)
    return
  }
  await transport.sendMail({ from: SMTP_FROM, to, subject, text })
}

export async function sendVerificationEmail(to: string, url: string): Promise<void> {
  await sendMail(
    to,
    'Verify your Saltline email',
    `Confirm your email to finish setting up your Saltline account:\n\n${url}\n\nIf you didn't create this account, you can ignore this email.`,
  )
}

export async function sendResetPasswordEmail(to: string, url: string): Promise<void> {
  await sendMail(
    to,
    'Reset your Saltline password',
    `Reset your Saltline password:\n\n${url}\n\nIf you didn't request this, you can ignore this email -- your password won't change.`,
  )
}
