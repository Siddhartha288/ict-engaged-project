const express = require('express');
const { query } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { canAccessBusinessData, advisorOwnsBusiness } = require('../services/access');

const router = express.Router();

router.get('/:businessId', authenticate, async (req, res, next) => {
  try {
    const businessId = Number(req.params.businessId);
    if (!Number.isInteger(businessId) || businessId < 1) {
      return res.status(400).json({ message: 'Invalid business id' });
    }
    if (!(await canAccessBusinessData(req.user, businessId))) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const rows = await query(
      `SELECT n.id, n.content, n.created_at, adv.name AS advisor_name
       FROM advisor_notes n
       JOIN users adv ON adv.id = n.advisor_user_id
       WHERE n.business_user_id = :business_id
       ORDER BY n.created_at DESC`,
      { business_id: businessId }
    );

    return res.json({ notes: rows });
  } catch (err) {
    return next(err);
  }
});

router.post('/:businessId', authenticate, requireRole('advisor'), async (req, res, next) => {
  try {
    const businessId = Number(req.params.businessId);
    if (!Number.isInteger(businessId) || businessId < 1) {
      return res.status(400).json({ message: 'Invalid business id' });
    }

    const content = String(req.body?.content || '').trim();
    if (!content) {
      return res.status(400).json({ message: 'Note content is required' });
    }
    if (content.length > 2000) {
      return res.status(400).json({ message: 'Note is too long (max 2000 characters)' });
    }

    // Advisors can only write notes about their own clients.
    if (!(await advisorOwnsBusiness(req.user.id, businessId))) {
      return res.status(404).json({ message: 'Business not found' });
    }

    const result = await query(
      `INSERT INTO advisor_notes (business_user_id, advisor_user_id, content)
       VALUES (:business_user_id, :advisor_user_id, :content)`,
      { business_user_id: businessId, advisor_user_id: req.user.id, content }
    );

    const rows = await query(
      `SELECT n.id, n.content, n.created_at, adv.name AS advisor_name
       FROM advisor_notes n
       JOIN users adv ON adv.id = n.advisor_user_id
       WHERE n.id = :id`,
      { id: result.insertId }
    );

    return res.status(201).json(rows[0]);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
