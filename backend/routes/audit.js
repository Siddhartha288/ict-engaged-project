const express = require('express');
const { query } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { runWebsiteAudit, normalizeUrl } = require('../services/websiteAudit');

const router = express.Router();
const COOLDOWN_MS = 30 * 1000;

function serializeAudit(row) {
  const social = Array.isArray(row.social_links_found)
    ? row.social_links_found
    : (row.social_links_found || '').split(',').filter(Boolean);

  return {
    id: row.id,
    url: row.url,
    status: row.status,
    error_message: row.error_message,
    https: row.https == null ? null : Boolean(row.https),
    mobile_friendly: row.mobile_friendly == null ? null : Boolean(row.mobile_friendly),
    has_title: row.has_title == null ? null : Boolean(row.has_title),
    has_meta_description: row.has_meta_description == null ? null : Boolean(row.has_meta_description),
    payment_detected: row.payment_detected == null ? null : Boolean(row.payment_detected),
    contact_detected: row.contact_detected == null ? null : Boolean(row.contact_detected),
    policy_detected: row.policy_detected == null ? null : Boolean(row.policy_detected),
    social_links_found: social,
    response_time_ms: row.response_time_ms,
    created_at: row.created_at,
  };
}

async function latestAuditFor(userId) {
  const rows = await query(
    'SELECT * FROM website_audits WHERE user_id = :user_id ORDER BY created_at DESC, id DESC LIMIT 1',
    { user_id: userId }
  );
  return rows.length ? rows[0] : null;
}

async function saveAudit(userId, result) {
  const insertResult = await query(
    `INSERT INTO website_audits
       (user_id, url, status, error_message, https, mobile_friendly, has_title,
        has_meta_description, payment_detected, contact_detected, policy_detected,
        social_links_found, response_time_ms)
     VALUES
       (:user_id, :url, :status, :error_message, :https, :mobile_friendly, :has_title,
        :has_meta_description, :payment_detected, :contact_detected, :policy_detected,
        :social_links_found, :response_time_ms)`,
    {
      user_id: userId,
      url: result.url,
      status: result.status,
      error_message: result.error_message,
      https: result.https == null ? null : result.https ? 1 : 0,
      mobile_friendly: result.mobile_friendly == null ? null : result.mobile_friendly ? 1 : 0,
      has_title: result.has_title == null ? null : result.has_title ? 1 : 0,
      has_meta_description:
        result.has_meta_description == null ? null : result.has_meta_description ? 1 : 0,
      payment_detected: result.payment_detected == null ? null : result.payment_detected ? 1 : 0,
      contact_detected: result.contact_detected == null ? null : result.contact_detected ? 1 : 0,
      policy_detected: result.policy_detected == null ? null : result.policy_detected ? 1 : 0,
      social_links_found: (result.social_links_found || []).join(','),
      response_time_ms: result.response_time_ms,
    }
  );
  return insertResult.insertId;
}

router.post('/', authenticate, requireRole('business'), async (req, res, next) => {
  try {
    const existing = await latestAuditFor(req.user.id);
    if (existing && Date.now() - new Date(existing.created_at).getTime() < COOLDOWN_MS) {
      return res.status(429).json({
        message: 'Please wait a moment before running another audit.',
      });
    }

    let url;
    try {
      url = normalizeUrl(req.body?.url);
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }

    const result = await runWebsiteAudit(url);
    const id = await saveAudit(req.user.id, result);

    return res.status(201).json(serializeAudit({ id, user_id: req.user.id, created_at: new Date(), ...result }));
  } catch (err) {
    return next(err);
  }
});

router.get('/', authenticate, requireRole('business'), async (req, res, next) => {
  try {
    const latest = await latestAuditFor(req.user.id);
    return res.json({ audit: latest ? serializeAudit(latest) : null });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
module.exports.serializeAudit = serializeAudit;
module.exports.latestAuditFor = latestAuditFor;
