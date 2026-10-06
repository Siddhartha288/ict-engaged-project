/**
 * Additive, idempotent migration for an EXISTING database (unlike schema.sql,
 * which drops every table and is for fresh setups only). Safe to run more than
 * once, and it never drops or rewrites data:
 *
 *   - creates the audit_log table if it is missing
 *   - adds users.password_changed_at if it is missing
 *
 * Usage (from the backend folder, with .env pointing at the target database):
 *   node migrate-security.js
 */
require('dotenv').config();
const { pool, query } = require('./db');

async function columnExists(table, column) {
  const rows = await query(
    `SELECT COUNT(*) AS n FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = :table AND column_name = :column`,
    { table, column }
  );
  return Number(rows[0].n) > 0;
}

async function main() {
  const [db] = await query('SELECT DATABASE() AS name');
  console.log(`Migrating database: ${db.name}`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      event_type VARCHAR(40) NOT NULL,
      actor_user_id INT UNSIGNED NULL,
      actor_email VARCHAR(255) NULL,
      target_user_id INT UNSIGNED NULL,
      detail VARCHAR(500) NULL,
      ip VARCHAR(64) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_audit_created (created_at),
      KEY idx_audit_type (event_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('audit_log table: ready');

  if (await columnExists('users', 'password_changed_at')) {
    console.log('users.password_changed_at: already present');
  } else {
    await pool.query('ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMP NULL AFTER claimed_at');
    console.log('users.password_changed_at: added');
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
