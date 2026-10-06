const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { loginGuard, clientIp, tooManyMessage } = require('../middleware/rateLimit');
const auditLog = require('../services/auditLog');

const router = express.Router();
const SALT_ROUNDS = 10;
const MIN_PASSWORD = 8;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      sector_id: user.sector_id || null,
      sector_key: user.sector_key || null,
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    business_name: row.business_name,
    sector_id: row.sector_id || null,
    sector_key: row.sector_key || null,
    sector_label: row.sector_label || null,
    advisor_code: row.advisor_code || null,
    advisor_id: row.advisor_id || null,
    created_at: row.created_at,
  };
}

const USER_SELECT = `
  SELECT u.id, u.name, u.email, u.password_hash, u.role, u.business_name, u.created_at,
         u.sector_id, s.\`key\` AS sector_key, s.label AS sector_label,
         u.advisor_code, u.advisor_id, u.is_active
  FROM users u
  LEFT JOIN sectors s ON s.id = u.sector_id
`;

function generateAdvisorCode() {
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  }
  return code;
}

async function assignUniqueAdvisorCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateAdvisorCode();
    const existing = await query('SELECT id FROM users WHERE advisor_code = :code LIMIT 1', {
      code,
    });
    if (!existing.length) return code;
  }
  throw new Error('Could not generate a unique advisor code');
}

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, role, business_name, sector, advisor_code } = req.body || {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: 'Name is required' });
    }
    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ message: 'Email is required' });
    }
    if (!password || typeof password !== 'string' || password.length < MIN_PASSWORD) {
      return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD} characters` });
    }

    const normalizedRole = role === 'advisor' ? 'advisor' : 'business';
    if (role && role !== 'business' && role !== 'advisor') {
      return res.status(400).json({ message: "Role must be 'business' or 'advisor'" });
    }

    let sectorId = null;
    let advisorId = null;

    if (normalizedRole === 'business') {
      if (!sector || typeof sector !== 'string' || !sector.trim()) {
        return res.status(400).json({ message: 'Business sector is required' });
      }
      const sectorRows = await query('SELECT id FROM sectors WHERE `key` = :key LIMIT 1', {
        key: sector.trim(),
      });
      if (!sectorRows.length) {
        return res.status(400).json({ message: 'Unknown business sector' });
      }
      sectorId = sectorRows[0].id;

      if (advisor_code && typeof advisor_code === 'string' && advisor_code.trim()) {
        const advisorRows = await query(
          "SELECT id FROM users WHERE advisor_code = :code AND role = 'advisor' LIMIT 1",
          { code: advisor_code.trim().toUpperCase() }
        );
        if (!advisorRows.length) {
          return res.status(400).json({ message: 'Invalid advisor code' });
        }
        advisorId = advisorRows[0].id;
      }
    }

    const existing = await query('SELECT id FROM users WHERE email = :email LIMIT 1', {
      email: email.trim().toLowerCase(),
    });
    if (existing.length) {
      return res.status(400).json({ message: 'Email is already registered' });
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const advisorCode = normalizedRole === 'advisor' ? await assignUniqueAdvisorCode() : null;

    const result = await query(
      `INSERT INTO users (name, email, password_hash, role, business_name, sector_id, advisor_id, advisor_code)
       VALUES (:name, :email, :password_hash, :role, :business_name, :sector_id, :advisor_id, :advisor_code)`,
      {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password_hash,
        role: normalizedRole,
        business_name:
          normalizedRole === 'business' && business_name
            ? String(business_name).trim()
            : null,
        sector_id: sectorId,
        advisor_id: advisorId,
        advisor_code: advisorCode,
      }
    );

    const rows = await query(`${USER_SELECT} WHERE u.id = :id`, { id: result.insertId });
    const user = rows[0];
    const token = signToken(user);

    return res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    return next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ message: 'Email is required' });
    }
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ message: 'Password is required' });
    }

    const normEmail = email.trim().toLowerCase();
    const ip = clientIp(req);

    const wait = loginGuard.check(normEmail, ip);
    if (wait > 0) {
      await auditLog.record('login_blocked', { actorEmail: normEmail, ip, detail: 'rate limit' });
      res.set('Retry-After', String(wait));
      return res.status(429).json({ message: tooManyMessage(wait) });
    }

    const rows = await query(`${USER_SELECT} WHERE u.email = :email LIMIT 1`, {
      email: normEmail,
    });

    if (!rows.length || !rows[0].password_hash) {
      loginGuard.fail(normEmail, ip);
      await auditLog.record('login_failed', {
        actorEmail: normEmail,
        ip,
        detail: rows.length ? 'account not claimed' : 'unknown account',
      });
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      loginGuard.fail(normEmail, ip);
      await auditLog.record('login_failed', {
        actorId: user.id,
        actorEmail: normEmail,
        ip,
        detail: 'wrong password',
      });
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    // Checked after the password so the status isn't revealed to someone who
    // doesn't know the credentials.
    if (!user.is_active) {
      await auditLog.record('login_deactivated', { actorId: user.id, actorEmail: normEmail, ip });
      return res.status(403).json({ message: 'This account has been deactivated. Contact an administrator.' });
    }

    loginGuard.succeed(normEmail);
    const token = signToken(user);
    return res.json({ token, user: publicUser(user) });
  } catch (err) {
    return next(err);
  }
});

// A logged-in user changing their own password. The current password is
// required (a stolen session alone can't take the account over), attempts count
// toward the same brute-force limits as login, and every token issued before
// the change stops working.
router.post('/change-password', authenticate, async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body || {};
    const ip = clientIp(req);
    const key = `change:${req.user.id}`;

    if (!current_password || typeof current_password !== 'string') {
      return res.status(400).json({ message: 'Current password is required' });
    }
    if (!new_password || typeof new_password !== 'string' || new_password.length < MIN_PASSWORD) {
      return res.status(400).json({ message: `New password must be at least ${MIN_PASSWORD} characters` });
    }
    if (new_password === current_password) {
      return res.status(400).json({ message: 'New password must be different from the current one' });
    }

    const wait = loginGuard.check(key, ip);
    if (wait > 0) {
      res.set('Retry-After', String(wait));
      return res.status(429).json({ message: tooManyMessage(wait) });
    }

    const rows = await query(`${USER_SELECT} WHERE u.id = :id LIMIT 1`, { id: req.user.id });
    const user = rows[0];
    if (!user || !user.password_hash || !(await bcrypt.compare(current_password, user.password_hash))) {
      loginGuard.fail(key, ip);
      await auditLog.record('password_change_failed', {
        actorId: req.user.id,
        actorEmail: req.user.email,
        ip,
        detail: 'wrong current password',
      });
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    const password_hash = await bcrypt.hash(new_password, SALT_ROUNDS);
    // Whole seconds, to match the second resolution of JWT "iat" and the column.
    const changedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
    await query(
      'UPDATE users SET password_hash = :password_hash, password_changed_at = :changedAt WHERE id = :id',
      { password_hash, changedAt, id: user.id }
    );
    loginGuard.succeed(key);
    await auditLog.record('password_changed', { actorId: user.id, actorEmail: user.email, ip });

    return res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    return next(err);
  }
});

router.post('/claim', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ message: 'Email is required' });
    }
    if (!password || typeof password !== 'string' || password.length < MIN_PASSWORD) {
      return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD} characters` });
    }

    const rows = await query(
      "SELECT id, password_hash FROM users WHERE email = :email AND role = 'business' LIMIT 1",
      { email: email.trim().toLowerCase() }
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'No unclaimed account found for that email' });
    }
    if (rows[0].password_hash) {
      return res.status(400).json({
        message: 'This account already has a password — log in instead',
      });
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    await query(
      'UPDATE users SET password_hash = :password_hash, claimed_at = CURRENT_TIMESTAMP WHERE id = :id',
      { password_hash, id: rows[0].id }
    );

    const userRows = await query(`${USER_SELECT} WHERE u.id = :id`, { id: rows[0].id });
    const user = userRows[0];
    const token = signToken(user);

    return res.json({ token, user: publicUser(user) });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
module.exports.assignUniqueAdvisorCode = assignUniqueAdvisorCode;
