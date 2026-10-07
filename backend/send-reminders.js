/**
 * Emails businesses that have gone quiet (no assessment for 30 days, or never
 * assessed a week after signing up). Each business is reminded at most once
 * every 30 days.
 *
 *   node send-reminders.js --dry-run   list who would be emailed, send nothing
 *   node send-reminders.js             send, and record last_reminder_at
 *
 * Needs RESEND_API_KEY and EMAIL_FROM (see services/email.js). Without them it
 * lists who is due and exits without recording anything, because nothing was
 * sent. Run it from cron or a scheduler, e.g. once a day.
 */
require('dotenv').config();
const { pool, query } = require('./db');
const { sendEmail, emailConfigured } = require('./services/email');
const { findDueEmailReminders } = require('./services/reminders');
const auditLog = require('./services/auditLog');

const dryRun = process.argv.includes('--dry-run');

function buildEmail(person) {
  const biz = person.business_name || 'your business';
  const when = person.never_assessed
    ? "you haven't taken your digital maturity assessment yet"
    : `it has been ${person.days_since} days since your last assessment`;
  const base = (process.env.APP_URL || '').replace(/\/$/, '');
  return {
    subject: 'Time for a digital check-in?',
    text:
      `Hi ${person.name},\n\n` +
      `A quick nudge from BizTransform: ${when} for ${biz}.\n\n` +
      `It takes about 3 minutes, and re-assessing shows which of your roadmap actions moved the score.\n` +
      (base ? `\nLog in: ${base}/login\n` : '') +
      `\nIf you'd rather not get these, just ignore this email — we send at most one a month.\n`,
  };
}

async function main() {
  const due = await findDueEmailReminders();
  console.log(`${due.length} business(es) due a reminder.`);
  for (const p of due) {
    console.log(`  #${p.id} ${p.email} — ${p.never_assessed ? 'never assessed' : `${p.days_since} days since last assessment`}`);
  }

  if (dryRun || due.length === 0) return;
  if (!emailConfigured()) {
    console.log('\nEmail is not configured (RESEND_API_KEY / EMAIL_FROM), so nothing was sent or recorded.');
    return;
  }

  let sent = 0;
  for (const p of due) {
    const result = await sendEmail({ to: p.email, ...buildEmail(p) });
    if (result.sent) {
      await query('UPDATE users SET last_reminder_at = :now WHERE id = :id', { now: new Date(), id: p.id });
      await auditLog.record('reminder_sent', { actorEmail: p.email, targetId: p.id });
      sent += 1;
    } else {
      console.error(`  could not email ${p.email}: ${result.reason}`);
    }
  }
  console.log(`\nSent ${sent} of ${due.length}.`);
}

main()
  .catch((err) => {
    console.error('Failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
