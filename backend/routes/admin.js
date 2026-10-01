const express = require('express');
const { query, pool } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const assessments = require('./assessments');

const router = express.Router();

const FOLLOW_UP_STATUSES = ['needs_follow_up', 'on_track', 'resolved'];

router.get(
  '/businesses',
  authenticate,
  requireRole('advisor'),
  async (req, res, next) => {
    try {
      const showAll = req.query.all === '1' || req.query.all === 'true';
      const rows = await query(
        `SELECT u.id, u.name, u.email, u.business_name, u.created_at, u.follow_up_status,
                u.advisor_id, u.password_hash,
                s.\`key\` AS sector_key, s.label AS sector_label,
                a.id AS assessment_id,
                a.total_score,
                a.level,
                a.created_at AS assessment_date,
                (SELECT COUNT(*) FROM advisor_notes n WHERE n.business_user_id = u.id) AS note_count
         FROM users u
         LEFT JOIN sectors s ON s.id = u.sector_id
         LEFT JOIN assessments a
           ON a.id = (
             SELECT a2.id
             FROM assessments a2
             WHERE a2.user_id = u.id
             ORDER BY a2.created_at DESC, a2.id DESC
             LIMIT 1
           )
         WHERE u.role = 'business' ${showAll ? '' : 'AND u.advisor_id = :advisor_id'}
         ORDER BY a.total_score IS NULL ASC, a.total_score DESC, u.name ASC`,
        showAll ? {} : { advisor_id: req.user.id }
      );

      return res.json({
        scope: showAll ? 'all' : 'mine',
        businesses: rows.map((r) => ({
          id: r.id,
          name: r.name,
          email: r.email,
          business_name: r.business_name,
          sector_key: r.sector_key,
          sector_label: r.sector_label,
          follow_up_status: r.follow_up_status,
          note_count: Number(r.note_count),
          is_mine: r.advisor_id === req.user.id,
          claimed: Boolean(r.password_hash),
          created_at: r.created_at,
          latest_assessment: r.assessment_id
            ? {
                id: r.assessment_id,
                score: Number(r.total_score),
                level: r.level,
                date: r.assessment_date,
              }
            : null,
        })),
      });
    } catch (err) {
      return next(err);
    }
  }
);

router.post(
  '/businesses',
  authenticate,
  requireRole('advisor'),
  async (req, res, next) => {
    try {
      const { name, email, business_name, sector } = req.body || {};

      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ message: 'Name is required' });
      }
      if (!email || typeof email !== 'string' || !email.trim()) {
        return res.status(400).json({ message: 'Email is required' });
      }
      if (!sector || typeof sector !== 'string' || !sector.trim()) {
        return res.status(400).json({ message: 'Business sector is required' });
      }

      const sectorRows = await query('SELECT id FROM sectors WHERE `key` = :key LIMIT 1', {
        key: sector.trim(),
      });
      if (!sectorRows.length) {
        return res.status(400).json({ message: 'Unknown business sector' });
      }

      const existing = await query('SELECT id FROM users WHERE email = :email LIMIT 1', {
        email: email.trim().toLowerCase(),
      });
      if (existing.length) {
        return res.status(400).json({ message: 'Email is already registered' });
      }

      const result = await query(
        `INSERT INTO users (name, email, password_hash, role, business_name, sector_id, advisor_id)
         VALUES (:name, :email, NULL, 'business', :business_name, :sector_id, :advisor_id)`,
        {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          business_name: business_name ? String(business_name).trim() : null,
          sector_id: sectorRows[0].id,
          advisor_id: req.user.id,
        }
      );

      const rows = await query(
        `SELECT u.id, u.name, u.email, u.business_name, u.created_at,
                s.\`key\` AS sector_key, s.label AS sector_label
         FROM users u
         LEFT JOIN sectors s ON s.id = u.sector_id
         WHERE u.id = :id`,
        { id: result.insertId }
      );

      return res.status(201).json(rows[0]);
    } catch (err) {
      return next(err);
    }
  }
);

router.get(
  '/businesses/:id',
  authenticate,
  requireRole('advisor'),
  async (req, res, next) => {
    try {
      const businessId = Number(req.params.id);
      if (!Number.isInteger(businessId) || businessId < 1) {
        return res.status(400).json({ message: 'Invalid business id' });
      }

      const rows = await query(
        `SELECT u.id, u.name, u.email, u.business_name, u.created_at, u.follow_up_status,
                u.advisor_id, u.password_hash,
                s.\`key\` AS sector_key, s.label AS sector_label
         FROM users u
         LEFT JOIN sectors s ON s.id = u.sector_id
         WHERE u.id = :id AND u.role = 'business'
         LIMIT 1`,
        { id: businessId }
      );
      if (!rows.length) {
        return res.status(404).json({ message: 'Business not found' });
      }
      const business = rows[0];

      const assessmentRows = await query(
        `SELECT id, total_score, level, created_at
         FROM assessments
         WHERE user_id = :id
         ORDER BY created_at DESC`,
        { id: businessId }
      );

      return res.json({
        id: business.id,
        name: business.name,
        email: business.email,
        business_name: business.business_name,
        sector_key: business.sector_key,
        sector_label: business.sector_label,
        follow_up_status: business.follow_up_status,
        is_mine: business.advisor_id === req.user.id,
        claimed: Boolean(business.password_hash),
        created_at: business.created_at,
        assessments: assessmentRows.map((a) => ({
          id: a.id,
          date: a.created_at,
          score: Number(a.total_score),
          level: a.level,
        })),
      });
    } catch (err) {
      return next(err);
    }
  }
);

router.get(
  '/businesses/:id/questions',
  authenticate,
  requireRole('advisor'),
  async (req, res, next) => {
    try {
      const businessId = Number(req.params.id);
      if (!Number.isInteger(businessId) || businessId < 1) {
        return res.status(400).json({ message: 'Invalid business id' });
      }

      const rows = await query(
        "SELECT sector_id FROM users WHERE id = :id AND role = 'business' LIMIT 1",
        { id: businessId }
      );
      if (!rows.length) {
        return res.status(404).json({ message: 'Business not found' });
      }

      const sectorId = await assessments.resolveSectorId(rows[0].sector_id);
      const grouped = await assessments.getGroupedQuestions(sectorId);
      return res.json({ categories: grouped });
    } catch (err) {
      return next(err);
    }
  }
);

router.post(
  '/businesses/:id/assessments',
  authenticate,
  requireRole('advisor'),
  async (req, res, next) => {
    try {
      const businessId = Number(req.params.id);
      if (!Number.isInteger(businessId) || businessId < 1) {
        return res.status(400).json({ message: 'Invalid business id' });
      }

      const rows = await query(
        "SELECT sector_id FROM users WHERE id = :id AND role = 'business' LIMIT 1",
        { id: businessId }
      );
      if (!rows.length) {
        return res.status(404).json({ message: 'Business not found' });
      }

      const sectorId = await assessments.resolveSectorId(rows[0].sector_id);
      const { result, error } = await assessments.submitAssessmentForUser(
        businessId,
        sectorId,
        req.body?.responses
      );
      if (error) return res.status(error.status).json({ message: error.message });
      return res.status(201).json(result);
    } catch (err) {
      return next(err);
    }
  }
);

router.patch(
  '/businesses/:id/status',
  authenticate,
  requireRole('advisor'),
  async (req, res, next) => {
    try {
      const businessId = Number(req.params.id);
      if (!Number.isInteger(businessId) || businessId < 1) {
        return res.status(400).json({ message: 'Invalid business id' });
      }

      const status = req.body?.status === null ? null : String(req.body?.status || '');
      if (status !== null && !FOLLOW_UP_STATUSES.includes(status)) {
        return res.status(400).json({
          message: `Status must be one of: ${FOLLOW_UP_STATUSES.join(', ')}, or null`,
        });
      }

      const result = await query(
        `UPDATE users SET follow_up_status = :status WHERE id = :id AND role = 'business'`,
        { status, id: businessId }
      );
      if (!result.affectedRows) {
        return res.status(404).json({ message: 'Business not found' });
      }

      return res.json({ id: businessId, follow_up_status: status });
    } catch (err) {
      return next(err);
    }
  }
);

router.get(
  '/impact',
  authenticate,
  requireRole('advisor'),
  async (req, res, next) => {
    try {
      const showAll = req.query.all === '1' || req.query.all === 'true';

      const businessRows = await query(
        `SELECT id, follow_up_status FROM users
         WHERE role = 'business' ${showAll ? '' : 'AND advisor_id = :advisor_id'}`,
        showAll ? {} : { advisor_id: req.user.id }
      );

      const statusBreakdown = { needs_follow_up: 0, on_track: 0, resolved: 0, none: 0 };
      for (const b of businessRows) {
        statusBreakdown[b.follow_up_status || 'none'] += 1;
      }

      if (businessRows.length === 0) {
        return res.json({
          scope: showAll ? 'all' : 'mine',
          caseload_size: 0,
          assessed_count: 0,
          average_current_score: null,
          average_improvement: null,
          improved_business_count: null,
          status_breakdown: statusBreakdown,
        });
      }

      const businessIds = businessRows.map((b) => b.id);
      const placeholders = businessIds.map(() => '?').join(',');
      const [assessmentRows] = await pool.execute(
        `SELECT user_id, id, total_score, created_at FROM assessments
         WHERE user_id IN (${placeholders})
         ORDER BY user_id ASC, created_at ASC, id ASC`,
        businessIds
      );

      const byUser = new Map();
      for (const row of assessmentRows) {
        if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
        byUser.get(row.user_id).push(row);
      }

      let currentScoreSum = 0;
      let currentScoreCount = 0;
      let improvementSum = 0;
      let improvementCount = 0;

      for (const list of byUser.values()) {
        const latest = list[list.length - 1];
        currentScoreSum += Number(latest.total_score);
        currentScoreCount += 1;

        if (list.length >= 2) {
          const first = list[0];
          improvementSum += Number(latest.total_score) - Number(first.total_score);
          improvementCount += 1;
        }
      }

      return res.json({
        scope: showAll ? 'all' : 'mine',
        caseload_size: businessRows.length,
        assessed_count: currentScoreCount,
        average_current_score: currentScoreCount
          ? Math.round(currentScoreSum / currentScoreCount)
          : null,
        average_improvement: improvementCount
          ? Math.round(improvementSum / improvementCount)
          : null,
        improved_business_count: improvementCount,
        status_breakdown: statusBreakdown,
      });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
