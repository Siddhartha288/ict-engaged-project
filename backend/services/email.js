/**
 * Optional email sending through Resend's HTTP API (no extra dependency).
 *
 *   RESEND_API_KEY   key from https://resend.com
 *   EMAIL_FROM       a sender Resend allows, e.g. "BizTransform <noreply@yourdomain.com>"
 *
 * Without both, nothing is sent and callers get { sent: false, reason }. The app
 * is designed to work either way: password resets fall back to an admin-issued
 * link, and reminders show in the app instead.
 *
 * Note: on Resend's free plan without a verified domain you can only email your
 * own account address, so this is mainly useful once a domain is set up.
 */
const REQUEST_TIMEOUT_MS = 15 * 1000;

function emailConfigured() {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  return Boolean(key && key.trim() && !key.includes('your_') && from && from.trim());
}

async function sendEmail({ to, subject, text }) {
  if (!emailConfigured()) return { sent: false, reason: 'email is not configured' };
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`,
      },
      body: JSON.stringify({ from: process.env.EMAIL_FROM.trim(), to: [to], subject, text }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { sent: false, reason: `email provider returned HTTP ${response.status}` };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

// Base URL for links in emails and generated links: APP_URL if set, else the
// origin the request came from.
function appBase(req) {
  const configured = (process.env.APP_URL || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  const origin = req.get('origin');
  if (origin) return origin.replace(/\/$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

module.exports = { sendEmail, emailConfigured, appBase };
