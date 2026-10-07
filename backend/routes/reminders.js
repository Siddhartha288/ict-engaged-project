const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { remindersFor } = require('../services/reminders');

const router = express.Router();

// In-app nudges for the logged-in business (the dashboard banner).
router.get('/', authenticate, requireRole('business'), async (req, res, next) => {
  try {
    return res.json(await remindersFor(req.user.id));
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
