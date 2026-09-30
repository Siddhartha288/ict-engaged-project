const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('../db');

const router = express.Router();
const SALT_ROUNDS = 10;
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
         u.advisor_code, u.advisor_id
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
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
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

    const rows = await query(`${USER_SELECT} WHERE u.email = :email LIMIT 1`, {
      email: email.trim().toLowerCase(),
    });

    if (!rows.length || !rows[0].password_hash) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = signToken(user);
    return res.json({ token, user: publicUser(user) });
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
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
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
