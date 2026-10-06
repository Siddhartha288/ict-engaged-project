const jwt = require('jsonwebtoken');
const { query } = require('../db');

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  let payload;
  try {
    payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  try {
    // Role and active-state come from the database, not the token, so a
    // deactivation or role change takes effect immediately instead of
    // lingering until the 7-day token expires.
    const rows = await query('SELECT role, is_active, password_changed_at FROM users WHERE id = :id LIMIT 1', {
      id: payload.id,
    });
    if (!rows.length || !rows[0].is_active) {
      return res.status(401).json({ message: 'This account is not active' });
    }

    // A password change invalidates every token issued before it, so a stolen
    // token stops working as soon as the owner changes their password.
    const changedAt = rows[0].password_changed_at;
    if (changedAt && payload.iat * 1000 < new Date(changedAt).getTime()) {
      return res.status(401).json({ message: 'Your session has expired. Please log in again.' });
    }

    req.user = {
      id: payload.id,
      email: payload.email,
      role: rows[0].role,
      name: payload.name,
      sector_id: payload.sector_id ?? null,
      sector_key: payload.sector_key ?? null,
    };
    return next();
  } catch (err) {
    return next(err);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    return next();
  };
}

module.exports = { authenticate, requireRole };
