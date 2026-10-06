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
    const rows = await query('SELECT role, is_active FROM users WHERE id = :id LIMIT 1', {
      id: payload.id,
    });
    if (!rows.length || !rows[0].is_active) {
      return res.status(401).json({ message: 'This account is not active' });
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
