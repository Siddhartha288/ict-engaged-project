/**
 * Records security and administrative events to the audit_log table (and the
 * console). Best-effort: a logging failure must never break the request that
 * triggered it, and secrets (passwords, tokens) are never passed in.
 */
const { query } = require('../db');

async function record(eventType, { actorId = null, actorEmail = null, targetId = null, detail = null, ip = null } = {}) {
  console.log(
    `[audit] ${eventType}` +
      (actorEmail ? ` actor=${actorEmail}` : '') +
      (targetId ? ` target=#${targetId}` : '') +
      (detail ? ` (${detail})` : '') +
      (ip ? ` ip=${ip}` : '')
  );
  try {
    await query(
      `INSERT INTO audit_log (event_type, actor_user_id, actor_email, target_user_id, detail, ip)
       VALUES (:event_type, :actor_user_id, :actor_email, :target_user_id, :detail, :ip)`,
      {
        event_type: eventType,
        actor_user_id: actorId,
        actor_email: actorEmail ? String(actorEmail).slice(0, 255) : null,
        target_user_id: targetId,
        detail: detail ? String(detail).slice(0, 500) : null,
        ip: ip ? String(ip).slice(0, 64) : null,
      }
    );
  } catch (err) {
    console.error('audit log write failed:', err.message);
  }
}

module.exports = { record };
