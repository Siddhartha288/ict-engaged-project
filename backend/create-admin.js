/**
 * Creates an admin account, or promotes an existing account to admin.
 * Admins can't self-register through the app, so this is the only way in.
 *
 * Usage (from the backend folder):
 *   node create-admin.js <email> <name> <password>
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool, query } = require('./db');

async function main() {
  const [email, name, password] = process.argv.slice(2);
  if (!email || !name || !password) {
    console.error('Usage: node create-admin.js <email> <name> <password>');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Use a password of at least 8 characters for an admin account.');
    process.exit(1);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const password_hash = await bcrypt.hash(password, 10);
  const existing = await query('SELECT id FROM users WHERE email = :email LIMIT 1', {
    email: normalizedEmail,
  });

  if (existing.length) {
    await query(
      "UPDATE users SET role = 'admin', is_active = 1, password_hash = :hash, password_changed_at = :now WHERE id = :id",
      { hash: password_hash, now: new Date(Math.floor(Date.now() / 1000) * 1000), id: existing[0].id }
    );
    await query("INSERT INTO audit_log (event_type, actor_email, detail) VALUES ('admin_created', :email, 'promoted via create-admin.js')", { email: normalizedEmail }).catch(() => {});
    console.log(`Promoted existing account ${normalizedEmail} to admin.`);
  } else {
    await query(
      "INSERT INTO users (name, email, password_hash, role) VALUES (:name, :email, :hash, 'admin')",
      { name: name.trim(), email: normalizedEmail, hash: password_hash }
    );
    await query("INSERT INTO audit_log (event_type, actor_email, detail) VALUES ('admin_created', :email, 'created via create-admin.js')", { email: normalizedEmail }).catch(() => {});
    console.log(`Created admin account ${normalizedEmail}.`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
