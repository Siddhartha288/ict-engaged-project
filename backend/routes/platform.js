const express = require('express');
const { query } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { assignUniqueAdvisorCode } = require('./auth');
const { clientIp } = require('../middleware/rateLimit');
const auditLog = require('../services/auditLog');
const { issueResetToken } = require('../services/passwordReset');
const { appBase } = require('../services/email');

const router = express.Router();
const ROLES = ['business', 'advisor', 'admin'];
router.use(authenticate, requireRole('admin'));

router.get('/stats', async (req, res, next) => {
  try {
    const roleRows = await query('SELECT role, COUNT(*) AS n FROM users GROUP BY role');
    const roles = { business: 0, advisor: 0, admin: 0 };
    for (const r of roleRows) roles[r.role] = Number(r.n);

    const [counts] = await query(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE is_active = 0) AS inactive_users,
         (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL 7 DAY) AS new_users_7d,
         (SELECT COUNT(*) FROM assessments) AS assessments,
         (SELECT ROUND(AVG(total_score)) FROM assessments) AS avg_score,
         (SELECT COUNT(*) FROM website_audits) AS audits`
    );

    const sectorRows = await query(
      `SELECT s.label, COUNT(u.id) AS businesses
       FROM sectors s
       LEFT JOIN users u ON u.sector_id = s.id AND u.role = 'business'
       GROUP BY s.id, s.label
       ORDER BY businesses DESC, s.id ASC`
    );

    return res.json({
      users_by_role: roles,
      inactive_users: Number(counts.inactive_users),
      new_users_7d: Number(counts.new_users_7d),
      assessments: Number(counts.assessments),
      average_score: counts.avg_score == null ? null : Number(counts.avg_score),
      website_audits: Number(counts.audits),
      businesses_by_sector: sectorRows.map((r) => ({ label: r.label, businesses: Number(r.businesses) })),
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/users', async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();
    const role = String(req.query.role || '').trim();
    const where = [];
    const params = {};

    if (['business', 'advisor', 'admin'].includes(role)) {
      where.push('u.role = :role');
      params.role = role;
    }
    if (search) {
      where.push('(u.name LIKE :q OR u.email LIKE :q OR u.business_name LIKE :q)');
      params.q = `%${search}%`;
    }

    const rows = await query(
      `SELECT u.id, u.name, u.email, u.role, u.business_name, u.is_active, u.created_at,
              s.label AS sector_label
       FROM users u
       LEFT JOIN sectors s ON s.id = u.sector_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY u.created_at DESC, u.id DESC
       LIMIT 200`,
      params
    );

    return res.json({
      users: rows.map((u) => ({ ...u, is_active: Boolean(u.is_active) })),
    });
  } catch (err) {
    return next(err);
  }
});

router.patch('/users/:id/active', async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId < 1) {
      return res.status(400).json({ message: 'Invalid user id' });
    }
    if (typeof req.body?.active !== 'boolean') {
      return res.status(400).json({ message: 'active must be true or false' });
    }
    if (userId === req.user.id) {
      return res.status(400).json({ message: 'You can’t deactivate your own account.' });
    }

    const result = await query('UPDATE users SET is_active = :active WHERE id = :id', {
      active: req.body.active ? 1 : 0,
      id: userId,
    });
    if (!result.affectedRows) {
      return res.status(404).json({ message: 'User not found' });
    }
    await auditLog.record('user_active_changed', {
      actorId: req.user.id,
      actorEmail: req.user.email,
      targetId: userId,
      detail: req.body.active ? 'activated' : 'deactivated',
      ip: clientIp(req),
    });
    return res.json({ id: userId, is_active: req.body.active });
  } catch (err) {
    return next(err);
  }
});

// Lets an admin hand a locked-out user a one-time reset link (valid for an hour)
// when email isn't set up or the user can't receive it.
router.post('/users/:id/reset-link', async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId < 1) {
      return res.status(400).json({ message: 'Invalid user id' });
    }
    if (userId === req.user.id) {
      return res.status(400).json({ message: 'Use the Account page to change your own password.' });
    }
    const rows = await query('SELECT id, email, is_active, password_hash FROM users WHERE id = :id LIMIT 1', { id: userId });
    if (!rows.length) return res.status(404).json({ message: 'User not found' });
    if (!rows[0].password_hash) {
      return res.status(400).json({ message: 'That account has not been claimed yet, so it has no password to reset.' });
    }
    if (!rows[0].is_active) {
      return res.status(400).json({ message: 'That account is deactivated. Reactivate it first.' });
    }

    const { token, expiresAt } = await issueResetToken(userId, req.user.id);
    await auditLog.record('reset_link_issued', {
      actorId: req.user.id,
      actorEmail: req.user.email,
      targetId: userId,
      detail: rows[0].email,
      ip: clientIp(req),
    });
    return res.json({ link: `${appBase(req)}/reset-password?token=${token}`, expires_at: expiresAt });
  } catch (err) {
    return next(err);
  }
});

router.patch('/users/:id/role', async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    const newRole = req.body?.role;
    if (!Number.isInteger(userId) || userId < 1) {
      return res.status(400).json({ message: 'Invalid user id' });
    }
    if (!ROLES.includes(newRole)) {
      return res.status(400).json({ message: `Role must be one of: ${ROLES.join(', ')}` });
    }
    // Blocking self-changes guarantees at least one admin always remains.
    if (userId === req.user.id) {
      return res.status(400).json({ message: 'You can’t change your own role.' });
    }

    const rows = await query('SELECT id, email, role, advisor_code FROM users WHERE id = :id LIMIT 1', {
      id: userId,
    });
    if (!rows.length) return res.status(404).json({ message: 'User not found' });
    const target = rows[0];
    if (target.role === newRole) {
      return res.status(400).json({ message: `That user is already ${newRole === 'admin' ? 'an admin' : `a ${newRole}`}.` });
    }

    // An advisor needs an invite code; accounts created as admins don't have one.
    const advisorCode =
      newRole === 'advisor' && !target.advisor_code ? await assignUniqueAdvisorCode() : target.advisor_code;

    await query('UPDATE users SET role = :role, advisor_code = :code WHERE id = :id', {
      role: newRole,
      code: advisorCode,
      id: userId,
    });

    await auditLog.record('role_changed', {
      actorId: req.user.id,
      actorEmail: req.user.email,
      targetId: userId,
      detail: `${target.email}: ${target.role} -> ${newRole}`,
      ip: clientIp(req),
    });
    return res.json({ id: userId, role: newRole });
  } catch (err) {
    return next(err);
  }
});

// Security and admin activity: failed logins, lockouts, role changes, etc.
router.get('/activity', async (req, res, next) => {
  try {
    const type = typeof req.query.type === 'string' ? req.query.type.trim() : '';
    const where = type ? 'WHERE event_type = :type' : '';
    const events = await query(
      `SELECT id, event_type, actor_email, target_user_id, detail, ip, created_at
       FROM audit_log ${where} ORDER BY id DESC LIMIT 200`,
      type ? { type } : {}
    );
    const types = await query('SELECT DISTINCT event_type FROM audit_log ORDER BY event_type');
    return res.json({ events, types: types.map((t) => t.event_type) });
  } catch (err) {
    return next(err);
  }
});

router.get('/questions', async (req, res, next) => {
  try {
    const sectors = await query('SELECT `key`, label FROM sectors ORDER BY id ASC');
    if (!sectors.length) return res.json({ sectors: [], sector: null, questions: [] });

    const requested = String(req.query.sector || '');
    const sector = sectors.find((s) => s.key === requested) || sectors[0];

    const questions = await query(
      `SELECT q.id, q.text, q.tip, q.sort_order, c.label AS category
       FROM questions q
       JOIN sectors s ON s.id = q.sector_id
       JOIN categories c ON c.id = q.category_id
       WHERE s.\`key\` = :key
       ORDER BY c.id ASC, q.sort_order ASC`,
      { key: sector.key }
    );

    return res.json({ sectors, sector, questions });
  } catch (err) {
    return next(err);
  }
});

router.patch('/questions/:id', async (req, res, next) => {
  try {
    const questionId = Number(req.params.id);
    if (!Number.isInteger(questionId) || questionId < 1) {
      return res.status(400).json({ message: 'Invalid question id' });
    }

    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : undefined;
    const tip = typeof req.body?.tip === 'string' ? req.body.tip.trim() : undefined;
    if (text === undefined && tip === undefined) {
      return res.status(400).json({ message: 'Provide text and/or tip to update' });
    }
    if (text !== undefined && (!text || text.length > 500)) {
      return res.status(400).json({ message: 'Question text must be 1–500 characters' });
    }
    if (tip !== undefined && tip.length > 500) {
      return res.status(400).json({ message: 'Tip must be at most 500 characters' });
    }

    const sets = [];
    const params = { id: questionId };
    if (text !== undefined) {
      sets.push('text = :text');
      params.text = text;
    }
    if (tip !== undefined) {
      sets.push('tip = :tip');
      params.tip = tip;
    }

    const result = await query(`UPDATE questions SET ${sets.join(', ')} WHERE id = :id`, params);
    if (!result.affectedRows) {
      return res.status(404).json({ message: 'Question not found' });
    }

    const rows = await query('SELECT id, text, tip FROM questions WHERE id = :id', { id: questionId });
    await auditLog.record('question_edited', {
      actorId: req.user.id,
      actorEmail: req.user.email,
      detail: `question #${questionId}`,
      ip: clientIp(req),
    });
    return res.json(rows[0]);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
