/**
 * Test harness: builds a throwaway database (always `biztransform_test` —
 * never the real one), loads the real schema and question bank into it, and
 * boots the real Express app on an ephemeral port. Tests talk to it over HTTP.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const mysql = require('mysql2/promise');

const BACKEND = path.join(__dirname, '..');
const TEST_DB = 'biztransform_test';

function connectionSettings() {
  require('dotenv').config({ path: path.join(BACKEND, '.env') });
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  };
}

async function createTestDatabase() {
  const settings = connectionSettings();
  const conn = await mysql.createConnection({ ...settings, multipleStatements: true });
  await conn.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
  await conn.query(`CREATE DATABASE \`${TEST_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${TEST_DB}\``);
  await conn.query(fs.readFileSync(path.join(BACKEND, 'schema.sql'), 'utf8'));
  await conn.end();

  const seed = spawnSync(process.execPath, ['seed-questions.js'], {
    cwd: BACKEND,
    env: { ...process.env, DB_NAME: TEST_DB },
    encoding: 'utf8',
  });
  if (seed.status !== 0) throw new Error(`Seeding questions failed: ${seed.stderr || seed.stdout}`);
}

async function dropTestDatabase() {
  const conn = await mysql.createConnection(connectionSettings());
  await conn.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
  await conn.end();
}

async function startApp() {
  await createTestDatabase();

  // Must be set before the app (and its DB pool) is first required.
  process.env.DB_NAME = TEST_DB;
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret';
  process.env.ANTHROPIC_API_KEY = ''; // force the deterministic rule-based roadmap
  process.env.BIZTRANSFORM_NO_LISTEN = '1';

  const app = require('../server');
  const db = require('../db');
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;

  async function stop() {
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
    await dropTestDatabase();
  }

  return { base, db, stop, request: makeRequest(base) };
}

function makeRequest(base) {
  return async function request(method, url, { token, body } = {}) {
    const res = await fetch(base + url, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      // non-JSON body
    }
    return { status: res.status, body: json };
  };
}

let counter = 0;
const uniqueEmail = (prefix) => `${prefix}-${Date.now()}-${++counter}@test.local`;

module.exports = { startApp, uniqueEmail };
