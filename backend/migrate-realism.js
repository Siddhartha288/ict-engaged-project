/**
 * Additive, idempotent migration for an EXISTING database (schema.sql is
 * destructive and only for fresh setups). Safe to run more than once; never
 * drops or rewrites data. Run it BEFORE restarting the server.
 *
 *   - users.claim_code_hash, users.last_reminder_at
 *   - website_audits.contact_detected, website_audits.policy_detected
 *   - password_resets and report_shares tables
 *
 * Run migrate-security.js first if this database predates it.
 *
 * Usage (backend folder, with .env pointing at the target database):
 *   node migrate-realism.js
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

async function addColumn(table, column, definition) {
  if (await columnExists(table, column)) {
    console.log(`${table}.${column}: already present`);
    return;
  }
  await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${column} ${definition}`);
  console.log(`${table}.${column}: added`);
}

async function main() {
  const [db] = await query('SELECT DATABASE() AS name');
  console.log(`Migrating database: ${db.name}`);

  await addColumn('users', 'claim_code_hash', 'CHAR(64) NULL');
  await addColumn('users', 'last_reminder_at', 'TIMESTAMP NULL');
  await addColumn('website_audits', 'contact_detected', 'TINYINT(1) NULL');
  await addColumn('website_audits', 'policy_detected', 'TINYINT(1) NULL');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id INT UNSIGNED NOT NULL,
      token_hash CHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      issued_by INT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_reset_token (token_hash),
      KEY idx_reset_user (user_id),
      CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('password_resets table: ready');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS report_shares (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id INT UNSIGNED NOT NULL,
      token_hash CHAR(64) NOT NULL,
      created_by INT UNSIGNED NULL,
      expires_at DATETIME NOT NULL,
      revoked_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_share_token (token_hash),
      KEY idx_share_user (user_id),
      CONSTRAINT fk_share_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('report_shares table: ready');

  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
