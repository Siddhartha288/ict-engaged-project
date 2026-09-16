const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { generateRoadmap } = require('../services/aiService');

const router = express.Router({ mergeParams: true });

async function loadAssessmentForUser(assessmentId, user) {
  const assessments = await query(
    `SELECT a.id, a.user_id, a.total_score, a.level, a.created_at,
            u.business_name, u.name AS user_name,
            s.label AS sector_label
     FROM assessments a
     JOIN users u ON u.id = a.user_id
     LEFT JOIN sectors s ON s.id = a.sector_id
     WHERE a.id = :id
     LIMIT 1`,
    { id: assessmentId }
  );

  if (!assessments.length) return { error: { status: 404, message: 'Assessment not found' } };

  const assessment = assessments[0];
  if (assessment.user_id !== user.id && user.role !== 'advisor') {
    return { error: { status: 403, message: 'Insufficient permissions' } };
  }

  return { assessment };
}

router.get('/:id/roadmap', authenticate, async (req, res, next) => {
  try {
    const assessmentId = Number(req.params.id);
    if (!Number.isInteger(assessmentId) || assessmentId < 1) {
      return res.status(400).json({ message: 'Invalid assessment id' });
    }

    const { assessment, error } = await loadAssessmentForUser(assessmentId, req.user);
    if (error) return res.status(error.status).json({ message: error.message });

    const rows = await query(
      `SELECT id, content, created_at FROM roadmaps WHERE assessment_id = :id LIMIT 1`,
      { id: assessment.id }
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'No roadmap generated yet' });
    }

    let content;
    try {
      content = JSON.parse(rows[0].content);
    } catch {
      content = { intro: rows[0].content, actions: [] };
    }

    return res.json({
      id: rows[0].id,
      assessment_id: assessment.id,
      content,
      created_at: rows[0].created_at,
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/:id/roadmap', authenticate, async (req, res, next) => {
  try {
    const assessmentId = Number(req.params.id);
    if (!Number.isInteger(assessmentId) || assessmentId < 1) {
      return res.status(400).json({ message: 'Invalid assessment id' });
    }

    const { assessment, error } = await loadAssessmentForUser(assessmentId, req.user);
    if (error) return res.status(error.status).json({ message: error.message });

    const force = Boolean(req.body?.force);

    const existing = await query(
      `SELECT id, content, created_at FROM roadmaps WHERE assessment_id = :id LIMIT 1`,
      { id: assessment.id }
    );
    if (existing.length && !force) {
      let content;
      try {
        content = JSON.parse(existing[0].content);
      } catch {
        content = { intro: existing[0].content, actions: [] };
      }
      return res.json({
        id: existing[0].id,
        assessment_id: assessment.id,
        content,
        created_at: existing[0].created_at,
        cached: true,
      });
    }

    const responseRows = await query(
      `SELECT r.answer, q.text AS question, q.tip AS tip, c.label AS category,
              c.id AS category_id, c.\`key\` AS category_key,
              q.id AS question_id
       FROM responses r
       JOIN questions q ON q.id = r.question_id
       JOIN categories c ON c.id = q.category_id
       WHERE r.assessment_id = :id
       ORDER BY c.id, q.sort_order`,
      { id: assessment.id }
    );

    const byCategory = new Map();
    for (const row of responseRows) {
      if (!byCategory.has(row.category_id)) {
        byCategory.set(row.category_id, {
          label: row.category,
          key: row.category_key,
          questionCount: 0,
          yesCount: 0,
        });
      }
      const cat = byCategory.get(row.category_id);
      cat.questionCount += 1;
      if (row.answer === 1) cat.yesCount += 1;
    }

    const categories = Array.from(byCategory.values()).map((c) => ({
      label: c.label,
      key: c.key,
      yesCount: c.yesCount,
      questionCount: c.questionCount,
      score: c.questionCount ? Math.round((c.yesCount / c.questionCount) * 100) : 0,
    }));

    const roadmap = await generateRoadmap({
      businessName: assessment.business_name || assessment.user_name,
      sector: assessment.sector_label || null,
      totalScore: Number(assessment.total_score),
      level: assessment.level,
      categories,
      answers: responseRows.map((r) => ({
        question: r.question,
        tip: r.tip,
        category: r.category,
        answer: r.answer,
      })),
    });

    const roadmapWithProgress = {
      ...roadmap,
      actions: roadmap.actions.map((action) => ({ ...action, completed: false })),
    };

    let roadmapId;
    if (existing.length) {
      await query(
        `UPDATE roadmaps SET content = :content, created_at = CURRENT_TIMESTAMP WHERE assessment_id = :assessment_id`,
        {
          assessment_id: assessment.id,
          content: JSON.stringify(roadmapWithProgress),
        }
      );
      roadmapId = existing[0].id;
    } else {
      const result = await query(
        `INSERT INTO roadmaps (assessment_id, content) VALUES (:assessment_id, :content)`,
        {
          assessment_id: assessment.id,
          content: JSON.stringify(roadmapWithProgress),
        }
      );
      roadmapId = result.insertId;
    }

    return res.status(existing.length ? 200 : 201).json({
      id: roadmapId,
      assessment_id: assessment.id,
      content: roadmapWithProgress,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Roadmap generation error:', err);
    return res.status(500).json({
      message: err.message || 'Failed to generate roadmap',
    });
  }
});

router.patch('/:id/roadmap/actions/:index', authenticate, async (req, res, next) => {
  try {
    const assessmentId = Number(req.params.id);
    const actionIndex = Number(req.params.index);
    if (!Number.isInteger(assessmentId) || assessmentId < 1) {
      return res.status(400).json({ message: 'Invalid assessment id' });
    }
    if (!Number.isInteger(actionIndex) || actionIndex < 0) {
      return res.status(400).json({ message: 'Invalid action index' });
    }

    const { assessment, error } = await loadAssessmentForUser(assessmentId, req.user);
    if (error) return res.status(error.status).json({ message: error.message });

    const rows = await query(
      `SELECT id, content FROM roadmaps WHERE assessment_id = :id LIMIT 1`,
      { id: assessment.id }
    );
    if (!rows.length) {
      return res.status(404).json({ message: 'No roadmap generated yet' });
    }

    let content;
    try {
      content = JSON.parse(rows[0].content);
    } catch {
      return res.status(500).json({ message: 'Roadmap content is corrupted' });
    }
    if (!Array.isArray(content.actions) || actionIndex >= content.actions.length) {
      return res.status(400).json({ message: 'Action index out of range' });
    }

    content.actions[actionIndex] = {
      ...content.actions[actionIndex],
      completed: Boolean(req.body?.completed),
    };

    await query(`UPDATE roadmaps SET content = :content WHERE id = :id`, {
      id: rows[0].id,
      content: JSON.stringify(content),
    });

    return res.json({ id: rows[0].id, assessment_id: assessment.id, content });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
