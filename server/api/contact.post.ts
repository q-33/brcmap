import { contactSchema } from '../utils/validation'

// Public contact form → emails the project inbox (CONTACT_TO), reply-to the
// sender so a reply goes straight back to them.
export default defineEventHandler(async (event) => {
  rateLimit(event, 'contact-ip', 5, 30 * 60_000)
  const { name, email, message } = await readValidatedBody(event, contactSchema.parse)

  const ok = await sendEmail({
    to: CONTACT_TO,
    replyTo: `${name} <${email}>`,
    subject: `BRC Map contact from ${name}`,
    text: `From: ${name} <${email}>\n\n${message}`,
    html: `<p><strong>${esc(name)}</strong> &lt;${esc(email)}&gt; wrote via the BRC Map contact form:</p>`
      + `<blockquote style="margin:12px 0;padding:8px 12px;border-left:3px solid #e1641a;color:#444;white-space:pre-wrap">${esc(message)}</blockquote>`,
  })
  // Always 200 — the client shows the mailto fallback when ok is false (avoids
  // edge-mangled 5xx responses and gives a graceful path if SMTP is down).
  return { ok }
})
