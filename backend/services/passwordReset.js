/**
 * One-time password reset tokens: random, stored only as a hash, valid for an
 * hour, usable once. A new token cancels any earlier unused ones for the user.
 * Used by "forgot password" (emailed, if email is configured) and by admins
 * issuing a link to a user directly.
 */
const { query } = require('../db');
const { sha256, newToken } = require('./tokens');

const RESET_MINUTES = 60;

async function issueResetToken(userId, issuedBy = null) {
  const token = newToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RESET_MINUTES * 60 * 1000);

  await query('UPDATE password_resets SET used_at = :now WHERE user_id = :user_id AND used_at IS NULL', {
    now,
    user_id: userId,
  });
  await query(
    'INSERT INTO password_resets (user_id, token_hash, expires_at, issued_by) VALUES (:user_id, :hash, :expires, :by)',
    { user_id: userId, hash: sha256(token), expires: expiresAt, by: issuedBy }
  );
  return { token, expiresAt };
}

// Returns { id, user_id, email } for a usable token, or null.
async function findValidReset(token) {
  if (typeof token !== 'string' || token.length < 20) return null;
  const rows = await query(
    `SELECT pr.id, pr.user_id, pr.expires_at, u.email, u.is_active
     FROM password_resets pr
     JOIN users u ON u.id = pr.user_id
     WHERE pr.token_hash = :hash AND pr.used_at IS NULL LIMIT 1`,
    { hash: sha256(token) }
  );
  const row = rows[0];
  if (!row || !row.is_active || new Date(row.expires_at) <= new Date()) return null;
  return { id: row.id, user_id: row.user_id, email: row.email };
}

async function consumeUserResets(userId) {
  await query('UPDATE password_resets SET used_at = :now WHERE user_id = :user_id AND used_at IS NULL', {
    now: new Date(),
    user_id: userId,
  });
}

module.exports = { issueResetToken, findValidReset, consumeUserResets, RESET_MINUTES };
