/**
 * "Come back" nudges. Two kinds:
 *   - it has been a while since the business last assessed itself
 *   - the latest roadmap has been sitting a while with actions still open
 *
 * remindersFor() powers the in-app banner. findDueEmailReminders() picks who to
 * email (see send-reminders.js), at most once per REMIND_EVERY_DAYS.
 */
const { query } = require('../db');

const REASSESS_AFTER_DAYS = 30;
const ACTIONS_STALE_AFTER_DAYS = 14;
const REMIND_EVERY_DAYS = 30;
const NEW_ACCOUNT_GRACE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const daysBetween = (later, earlier) => Math.floor((later.getTime() - new Date(earlier).getTime()) / DAY_MS);

async function remindersFor(userId, now = new Date()) {
  const assessments = await query(
    'SELECT id, created_at FROM assessments WHERE user_id = :user_id ORDER BY created_at DESC, id DESC LIMIT 1',
    { user_id: userId }
  );

  if (!assessments.length) {
    return { reassess: { due: false, never: true, days_since: null, last_assessment_at: null }, actions: null };
  }

  const latest = assessments[0];
  const daysSince = daysBetween(now, latest.created_at);

  let actions = null;
  const roadmaps = await query('SELECT content, created_at FROM roadmaps WHERE assessment_id = :id LIMIT 1', {
    id: latest.id,
  });
  if (roadmaps.length) {
    try {
      const content = JSON.parse(roadmaps[0].content);
      const open = (content.actions || []).filter((a) => !a.completed).length;
      const age = daysBetween(now, roadmaps[0].created_at);
      if (open > 0 && age >= ACTIONS_STALE_AFTER_DAYS) {
        actions = { open_count: open, roadmap_age_days: age };
      }
    } catch {
      // unreadable roadmap: no action reminder
    }
  }

  return {
    reassess: {
      due: daysSince >= REASSESS_AFTER_DAYS,
      never: false,
      days_since: daysSince,
      last_assessment_at: latest.created_at,
    },
    actions,
  };
}

async function findDueEmailReminders(now = new Date()) {
  const assessedBefore = new Date(now.getTime() - REASSESS_AFTER_DAYS * DAY_MS);
  const createdBefore = new Date(now.getTime() - NEW_ACCOUNT_GRACE_DAYS * DAY_MS);
  const remindedBefore = new Date(now.getTime() - REMIND_EVERY_DAYS * DAY_MS);

  const rows = await query(
    `SELECT u.id, u.name, u.email, u.business_name, u.created_at,
            (SELECT MAX(a.created_at) FROM assessments a WHERE a.user_id = u.id) AS last_assessment_at
     FROM users u
     WHERE u.role = 'business' AND u.is_active = 1 AND u.password_hash IS NOT NULL
       AND (u.last_reminder_at IS NULL OR u.last_reminder_at <= :reminded_before)
     HAVING (last_assessment_at IS NULL AND created_at <= :created_before)
         OR (last_assessment_at IS NOT NULL AND last_assessment_at <= :assessed_before)
     ORDER BY u.id`,
    { reminded_before: remindedBefore, created_before: createdBefore, assessed_before: assessedBefore }
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    business_name: r.business_name,
    never_assessed: !r.last_assessment_at,
    days_since: r.last_assessment_at ? daysBetween(now, r.last_assessment_at) : null,
  }));
}

module.exports = {
  remindersFor,
  findDueEmailReminders,
  REASSESS_AFTER_DAYS,
  ACTIONS_STALE_AFTER_DAYS,
  REMIND_EVERY_DAYS,
};
