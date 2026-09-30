const express = require('express');
const { query } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

const FOLLOW_UP_STATUSES = ['needs_follow_up', 'on_track', 'resolved'];

router.get(
  '/businesses',
  authenticate,
  requireRole('advisor'),
  async (req, res, next) => {
    try {
      const rows = await query(
        `SELECT u.id, u.name, u.email, u.business_name, u.created_at, u.follow_up_status,
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
         WHERE u.role = 'business'
         ORDER BY a.total_score IS NULL ASC, a.total_score DESC, u.name ASC`
      );

      return res.json({
        businesses: rows.map((r) => ({
          id: r.id,
          name: r.name,
          email: r.email,
          business_name: r.business_name,
          sector_key: r.sector_key,
          sector_label: r.sector_label,
          follow_up_status: r.follow_up_status,
          note_count: Number(r.note_count),
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

      const assessments = await query(
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
        created_at: business.created_at,
        assessments: assessments.map((a) => ({
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

module.exports = router;
