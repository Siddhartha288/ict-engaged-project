/**
 * Read-only share links for a business's latest report, so it can be sent to a
 * bank, partner or accountant without giving them an account.
 *
 * The link contains a random token; only its hash is stored. Links expire after
 * 14 days and can be revoked. The shared view shows the business name, sector,
 * score, category breakdown and roadmap — never the owner's name or email, and
 * never the cost/benefit figures.
 */
const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { loginGuard, clientIp } = require('../middleware/rateLimit');
const { advisorOwnsBusiness } = require('../services/access');
const { sha256, newToken } = require('../services/tokens');
const { appBase } = require('../services/email');
const auditLog = require('../services/auditLog');
const { buildCategoryBreakdown } = require('./assessments');

const router = express.Router();
const SHARE_DAYS = 14;
const MAX_ACTIVE_LINKS = 5;

// Which business a request is about: a business always means itself; an
// advisor names one of their own clients.
async function resolveBusinessId(user, requested) {
  if (user.role === 'business') return user.id;
  if (user.role === 'advisor') {
    const id = Number(requested);
    if (Number.isInteger(id) && id > 0 && (await advisorOwnsBusiness(user.id, id))) return id;
  }
  return null;
}

router.post('/share', authenticate, async (req, res, next) => {
  try {
    const businessId = await resolveBusinessId(req.user, req.body?.business_id);
    if (!businessId) return res.status(404).json({ message: 'Business not found' });

    const assessed = await query('SELECT id FROM assessments WHERE user_id = :id LIMIT 1', { id: businessId });
    if (!assessed.length) {
      return res.status(400).json({ message: 'Complete an assessment before sharing a report.' });
    }

    const now = new Date();
    const active = await query(
      'SELECT COUNT(*) AS n FROM report_shares WHERE user_id = :id AND revoked_at IS NULL AND expires_at > :now',
      { id: businessId, now }
    );
    if (Number(active[0].n) >= MAX_ACTIVE_LINKS) {
      return res.status(400).json({ message: `You already have ${MAX_ACTIVE_LINKS} active links. Revoke one first.` });
    }

    const token = newToken();
    const expiresAt = new Date(now.getTime() + SHARE_DAYS * 24 * 60 * 60 * 1000);
    const result = await query(
      'INSERT INTO report_shares (user_id, token_hash, created_by, expires_at) VALUES (:user_id, :hash, :by, :expires)',
      { user_id: businessId, hash: sha256(token), by: req.user.id, expires: expiresAt }
    );
    await auditLog.record('report_shared', {
      actorId: req.user.id,
      actorEmail: req.user.email,
      targetId: businessId,
      ip: clientIp(req),
    });

    return res.status(201).json({
      id: result.insertId,
      link: `${appBase(req)}/shared/${token}`,
      expires_at: expiresAt,
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/share', authenticate, async (req, res, next) => {
  try {
    const businessId = await resolveBusinessId(req.user, req.query.business_id);
    if (!businessId) return res.status(404).json({ message: 'Business not found' });
    const rows = await query(
      `SELECT id, created_at, expires_at FROM report_shares
       WHERE user_id = :id AND revoked_at IS NULL AND expires_at > :now ORDER BY id DESC`,
      { id: businessId, now: new Date() }
    );
    return res.json({ shares: rows });
  } catch (err) {
    return next(err);
  }
});

router.delete('/share/:id', authenticate, async (req, res, next) => {
  try {
    const shareId = Number(req.params.id);
    if (!Number.isInteger(shareId) || shareId < 1) return res.status(400).json({ message: 'Invalid link id' });
    const rows = await query('SELECT id, user_id FROM report_shares WHERE id = :id LIMIT 1', { id: shareId });
    // The link must belong to the caller (or to one of the caller's clients).
    const businessId = rows.length ? await resolveBusinessId(req.user, rows[0].user_id) : null;
    if (!businessId || businessId !== rows[0].user_id) return res.status(404).json({ message: 'Link not found' });
    await query('UPDATE report_shares SET revoked_at = :now WHERE id = :id', { now: new Date(), id: shareId });
    return res.json({ id: shareId, revoked: true });
  } catch (err) {
    return next(err);
  }
});

// Public: anyone holding a valid token can read the shared report.
router.get('/shared/:token', async (req, res, next) => {
  try {
    const ip = clientIp(req);
    const throttleKey = `shared:${ip}`;
    const wait = loginGuard.check(throttleKey, ip);
    if (wait > 0) {
      res.set('Retry-After', String(wait));
      return res.status(429).json({ message: 'Too many attempts. Please try again later.' });
    }

    const rows = await query(
      `SELECT sh.expires_at, sh.revoked_at, u.id AS user_id, u.business_name, u.name AS owner_name, s.label AS sector_label
       FROM report_shares sh
       JOIN users u ON u.id = sh.user_id
       LEFT JOIN sectors s ON s.id = u.sector_id
       WHERE sh.token_hash = :hash LIMIT 1`,
      { hash: sha256(req.params.token) }
    );
    const share = rows[0];
    if (!share || share.revoked_at || new Date(share.expires_at) <= new Date()) {
      loginGuard.fail(throttleKey, ip);
      return res.status(404).json({ message: 'This link is invalid or has expired.' });
    }

    const assessments = await query(
      'SELECT id, total_score, level, created_at FROM assessments WHERE user_id = :id ORDER BY created_at DESC, id DESC LIMIT 1',
      { id: share.user_id }
    );
    if (!assessments.length) return res.status(404).json({ message: 'This link is invalid or has expired.' });
    const assessment = assessments[0];

    const responseRows = await query(
      `SELECT r.question_id, r.answer, q.category_id, c.\`key\` AS category_key, c.label AS category_label
       FROM responses r
       JOIN questions q ON q.id = r.question_id
       JOIN categories c ON c.id = q.category_id
       WHERE r.assessment_id = :id
       ORDER BY c.id ASC, q.sort_order ASC`,
      { id: assessment.id }
    );
    const categories = buildCategoryBreakdown(
      responseRows.map((r) => ({
        id: r.question_id,
        category_id: r.category_id,
        category_key: r.category_key,
        category_label: r.category_label,
      })),
      new Map(responseRows.map((r) => [r.question_id, r.answer]))
    );

    let roadmap = null;
    const roadmapRows = await query('SELECT content FROM roadmaps WHERE assessment_id = :id LIMIT 1', { id: assessment.id });
    if (roadmapRows.length) {
      try {
        const content = JSON.parse(roadmapRows[0].content);
        roadmap = {
          intro: content.intro,
          generated_by: content.generated_by || null,
          actions: (content.actions || []).map((a) => ({
            priority: a.priority,
            title: a.title,
            category: a.category,
            timeframe: a.timeframe,
            description: a.description,
            completed: Boolean(a.completed),
          })),
        };
      } catch {
        roadmap = null;
      }
    }

    return res.json({
      business_name: share.business_name || share.owner_name,
      sector_label: share.sector_label,
      assessed_at: assessment.created_at,
      total_score: Number(assessment.total_score),
      level: assessment.level,
      categories,
      roadmap,
      expires_at: share.expires_at,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
