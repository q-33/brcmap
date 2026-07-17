import type { Transporter } from 'nodemailer'
import nodemailer from 'nodemailer'

// Transactional email via DreamHost SMTP (nodemailer). Optional: if SMTP_PASSWORD
// isn't configured the helpers no-op, so the app still runs without email.
//
// Configure on the server (DigitalOcean env / secret) — only SMTP_PASSWORD is
// required, the rest have sensible DreamHost defaults:
//   SMTP_PASSWORD   the digit@burnermap.org mailbox password   (SECRET, required)
//   SMTP_USER       default: digit@burnermap.org
//   SMTP_HOST       default: smtp.dreamhost.com
//   SMTP_PORT       default: 465 (implicit SSL)
//   EMAIL_FROM      default: "BRC Map <digit@burnermap.org>"
//   CONTACT_TO      default: digit@burnermap.org   (where the contact form lands)

const SITE_URL = process.env.PUBLIC_SITE_URL ?? 'https://brcmap.net'

export const CONTACT_TO = process.env.CONTACT_TO ?? 'digit@burnermap.org'

let _transporter: Transporter | null = null
function transporter(): Transporter | null {
  const pass = process.env.SMTP_PASSWORD
  if (!pass)
    return null // email not configured — callers no-op gracefully
  if (!_transporter) {
    const port = Number(process.env.SMTP_PORT ?? 465)
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'smtp.dreamhost.com',
      port,
      secure: port === 465, // implicit SSL on 465; STARTTLS otherwise
      auth: { user: process.env.SMTP_USER ?? 'digit@burnermap.org', pass },
      // Fail fast instead of hanging the request if outbound SMTP is blocked
      // (some hosts, incl. DigitalOcean App Platform, block ports 465/587).
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    })
  }
  return _transporter
}

export interface EmailOpts { to: string, subject: string, html: string, text: string, replyTo?: string }

export async function sendEmail(opts: EmailOpts): Promise<boolean> {
  const t = transporter()
  if (!t)
    return false
  try {
    await t.sendMail({
      from: process.env.EMAIL_FROM ?? 'BRC Map <digit@burnermap.org>',
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      replyTo: opts.replyTo,
    })
    return true
  }
  catch (err) {
    // Log so SMTP misconfig is debuggable in the server logs, but never throw —
    // email is a best-effort side channel.
    console.error('[email] sendMail failed:', (err as Error)?.message)
    return false
  }
}

export const esc = (s: string): string => s.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!))

// "You have a new message" nudge — sent only on the first unread from a sender
// so an active back-and-forth doesn't spam the inbox.
export async function notifyNewMessage(to: string, fromName: string, preview: string): Promise<void> {
  const url = `${SITE_URL}/messages`
  const snippet = preview.length > 140 ? `${preview.slice(0, 140)}…` : preview
  await sendEmail({
    to,
    subject: `New message from ${fromName} on BRC Map`,
    text: `${fromName} sent you a message on BRC Map:\n\n"${snippet}"\n\nReply here: ${url}`,
    html: `<p><strong>${esc(fromName)}</strong> sent you a message on BRC Map:</p>`
      + `<blockquote style="margin:12px 0;padding:8px 12px;border-left:3px solid #e1641a;color:#444">${esc(snippet)}</blockquote>`
      + `<p><a href="${url}" style="color:#e1641a">Open your inbox to reply →</a></p>`,
  })
}

// Password-reset link email.
export async function sendPasswordReset(to: string, resetUrl: string): Promise<boolean> {
  return sendEmail({
    to,
    subject: 'Reset your BRC Map password',
    text: `Someone asked to reset the password for your BRC Map account.\n\n`
      + `Reset it here (link expires in 1 hour):\n${resetUrl}\n\n`
      + `If you didn't request this, you can ignore this email — your password won't change.`,
    html: `<p>Someone asked to reset the password for your BRC Map account.</p>`
      + `<p><a href="${resetUrl}" style="display:inline-block;background:#e1641a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Reset your password →</a></p>`
      + `<p style="color:#666;font-size:13px">This link expires in 1 hour. If you didn't request it, ignore this email — your password won't change.</p>`,
  })
}

// Admin notification: a new user registered. Sent to CONTACT_TO (digit@…).
export async function notifySignup(email: string, displayName: string | null): Promise<void> {
  const who = displayName || email
  await sendEmail({
    to: CONTACT_TO,
    subject: `New BRC Map signup: ${who}`,
    text: `A new user just registered on BRC Map:\n\n  Email: ${email}\n  Name:  ${displayName || '(none)'}\n\nManage users: ${SITE_URL}/admin?tab=people`,
    html: `<p>A new user just registered on BRC Map:</p>`
      + `<ul><li><strong>Email:</strong> ${esc(email)}</li><li><strong>Name:</strong> ${esc(displayName || '(none)')}</li></ul>`
      + `<p><a href="${SITE_URL}/admin?tab=people" style="color:#e1641a">Manage users →</a></p>`,
  })
}
