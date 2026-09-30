const express = require('express');
const { query, pool } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

function scoreToLevel(score) {
  if (score >= 80) return 'Digital Ready';
  if (score >= 60) return 'Digitally Growing';
  if (score >= 40) return 'Getting Started';
  return 'Foundation Needed';
}

function buildCategoryBreakdown(questions, responsesByQuestion) {
  const byCategory = new Map();

  for (const q of questions) {
    if (!byCategory.has(q.category_id)) {
      byCategory.set(q.category_id, {
        category_id: q.category_id,
        key: q.category_key,
        label: q.category_label,
        questionCount: 0,
        yesCount: 0,
      });
    }
    const cat = byCategory.get(q.category_id);
    cat.questionCount += 1;
    const answer = responsesByQuestion.get(q.id);
    if (answer === 1) cat.yesCount += 1;
  }

  return Array.from(byCategory.values()).map((cat) => ({
    ...cat,
    score:
      cat.questionCount === 0
        ? 0
        : Math.round((cat.yesCount / cat.questionCount) * 100),
  }));
}

async function resolveSectorId(sectorIdOrNull) {
  if (sectorIdOrNull) return sectorIdOrNull;
  const fallback = await query("SELECT id FROM sectors WHERE `key` = 'other' LIMIT 1");
  return fallback.length ? fallback[0].id : null;
}

async function getGroupedQuestions(sectorId) {
  const rows = await query(
    `SELECT q.id, q.text, q.sort_order, q.category_id,
            c.\`key\` AS category_key, c.label AS category_label
     FROM questions q
     JOIN categories c ON c.id = q.category_id
     WHERE q.sector_id = :sector_id
     ORDER BY c.id ASC, q.sort_order ASC, q.id ASC`,
    { sector_id: sectorId }
  );

  const grouped = [];
  const indexById = new Map();

  for (const row of rows) {
    if (!indexById.has(row.category_id)) {
      indexById.set(row.category_id, grouped.length);
      grouped.push({
        id: row.category_id,
        key: row.category_key,
        label: row.category_label,
        questions: [],
      });
    }
    grouped[indexById.get(row.category_id)].questions.push({
      id: row.id,
      text: row.text,
      sort_order: row.sort_order,
    });
  }

  return grouped;
}

async function submitAssessmentForUser(userId, sectorId, responses) {
  if (!Array.isArray(responses) || responses.length === 0) {
    return { error: { status: 400, message: 'responses must be a non-empty array' } };
  }

  for (const item of responses) {
    if (
      !item ||
      typeof item.question_id !== 'number' ||
      !Number.isInteger(item.question_id) ||
      (item.answer !== 0 && item.answer !== 1)
    ) {
      return {
        error: { status: 400, message: 'Each response needs question_id (integer) and answer (0 or 1)' },
      };
    }
  }

  const questions = await query(
    `SELECT q.id, q.category_id, c.\`key\` AS category_key, c.label AS category_label
     FROM questions q
     JOIN categories c ON c.id = q.category_id
     WHERE q.sector_id = :sector_id`,
    { sector_id: sectorId }
  );

  if (questions.length === 0) {
    return { error: { status: 500, message: 'No questions configured' } };
  }

  const questionIds = new Set(questions.map((q) => q.id));
  const seen = new Set();
  for (const item of responses) {
    if (!questionIds.has(item.question_id)) {
      return { error: { status: 400, message: `Unknown question_id: ${item.question_id}` } };
    }
    if (seen.has(item.question_id)) {
      return { error: { status: 400, message: `Duplicate question_id: ${item.question_id}` } };
    }
    seen.add(item.question_id);
  }

  if (seen.size !== questions.length) {
    return { error: { status: 400, message: `All ${questions.length} questions must be answered` } };
  }

  const responsesByQuestion = new Map(responses.map((r) => [r.question_id, r.answer]));
  const categories = buildCategoryBreakdown(questions, responsesByQuestion);
  const totalScore = Math.round(
    categories.reduce((sum, c) => sum + c.score, 0) / categories.length
  );
  const level = scoreToLevel(totalScore);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [assessmentResult] = await connection.execute(
      `INSERT INTO assessments (user_id, sector_id, total_score, level)
       VALUES (?, ?, ?, ?)`,
      [userId, sectorId, totalScore, level]
    );
    const assessmentId = assessmentResult.insertId;

    for (const item of responses) {
      await connection.execute(
        `INSERT INTO responses (assessment_id, question_id, answer)
         VALUES (?, ?, ?)`,
        [assessmentId, item.question_id, item.answer]
      );
    }

    await connection.commit();

    return {
      result: {
        id: assessmentId,
        total_score: totalScore,
        level,
        categories,
        created_at: new Date().toISOString(),
      },
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

router.get('/questions', authenticate, async (req, res, next) => {
  try {
    const sectorId = await resolveSectorId(req.user.sector_id);
    const grouped = await getGroupedQuestions(sectorId);
    return res.json({ categories: grouped });
  } catch (err) {
    return next(err);
  }
});

router.post('/assessments', authenticate, async (req, res, next) => {
  try {
    const sectorId = await resolveSectorId(req.user.sector_id);
    const { result, error } = await submitAssessmentForUser(
      req.user.id,
      sectorId,
      req.body?.responses
    );
    if (error) return res.status(error.status).json({ message: error.message });
    return res.status(201).json(result);
  } catch (err) {
    return next(err);
  }
});

router.get('/assessments', authenticate, async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT id, total_score, level, created_at
       FROM assessments
       WHERE user_id = :user_id
       ORDER BY created_at DESC`,
      { user_id: req.user.id }
    );

    return res.json({
      assessments: rows.map((r) => ({
        id: r.id,
        date: r.created_at,
        score: Number(r.total_score),
        level: r.level,
      })),
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/assessments/:id', authenticate, async (req, res, next) => {
  try {
    const assessmentId = Number(req.params.id);
    if (!Number.isInteger(assessmentId) || assessmentId < 1) {
      return res.status(400).json({ message: 'Invalid assessment id' });
    }

    const assessments = await query(
      `SELECT id, user_id, total_score, level, created_at
       FROM assessments WHERE id = :id LIMIT 1`,
      { id: assessmentId }
    );

    if (!assessments.length) {
      return res.status(404).json({ message: 'Assessment not found' });
    }

    const assessment = assessments[0];
    if (assessment.user_id !== req.user.id && req.user.role !== 'advisor') {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const responseRows = await query(
      `SELECT r.question_id, r.answer, q.text AS question_text,
              q.category_id, c.\`key\` AS category_key, c.label AS category_label
       FROM responses r
       JOIN questions q ON q.id = r.question_id
       JOIN categories c ON c.id = q.category_id
       WHERE r.assessment_id = :assessment_id
       ORDER BY c.id ASC, q.sort_order ASC`,
      { assessment_id: assessmentId }
    );

    const questions = responseRows.map((r) => ({
      id: r.question_id,
      category_id: r.category_id,
      category_key: r.category_key,
      category_label: r.category_label,
    }));
    const responsesByQuestion = new Map(responseRows.map((r) => [r.question_id, r.answer]));
    const categories = buildCategoryBreakdown(questions, responsesByQuestion);

    return res.json({
      id: assessment.id,
      total_score: Number(assessment.total_score),
      level: assessment.level,
      created_at: assessment.created_at,
      categories,
      responses: responseRows.map((r) => ({
        question_id: r.question_id,
        question: r.question_text,
        category: r.category_label,
        answer: r.answer,
      })),
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/assessments/:id/benchmark', authenticate, async (req, res, next) => {
  try {
    const assessmentId = Number(req.params.id);
    if (!Number.isInteger(assessmentId) || assessmentId < 1) {
      return res.status(400).json({ message: 'Invalid assessment id' });
    }

    const assessments = await query(
      `SELECT a.id, a.user_id, a.sector_id, s.label AS sector_label
       FROM assessments a
       LEFT JOIN sectors s ON s.id = a.sector_id
       WHERE a.id = :id LIMIT 1`,
      { id: assessmentId }
    );
    if (!assessments.length) {
      return res.status(404).json({ message: 'Assessment not found' });
    }

    const assessment = assessments[0];
    if (assessment.user_id !== req.user.id && req.user.role !== 'advisor') {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    if (!assessment.sector_id) {
      return res.json({
        sector_label: null,
        sample_size: 0,
        overall_avg_score: null,
        categories: [],
        insufficient_data: true,
      });
    }

    // Latest assessment per business within this sector.
    const latest = await query(
      `SELECT a1.id, a1.total_score
       FROM assessments a1
       WHERE a1.sector_id = :sector_id
         AND a1.id = (
           SELECT MAX(a2.id) FROM assessments a2
           WHERE a2.user_id = a1.user_id AND a2.sector_id = :sector_id
         )`,
      { sector_id: assessment.sector_id }
    );

    const sampleSize = latest.length;
    if (sampleSize < 2) {
      return res.json({
        sector_label: assessment.sector_label,
        sample_size: sampleSize,
        overall_avg_score: null,
        categories: [],
        insufficient_data: true,
      });
    }

    const overallAvgScore = Math.round(
      latest.reduce((sum, r) => sum + Number(r.total_score), 0) / sampleSize
    );

    const ids = latest.map((r) => r.id);
    const placeholders = ids.map(() => '?').join(',');
    const [categoryRows] = await pool.execute(
      `SELECT c.\`key\` AS category_key, c.label AS category_label,
              AVG(sub.pct) AS avg_score
       FROM (
         SELECT r.assessment_id, q.category_id, AVG(r.answer) * 100 AS pct
         FROM responses r
         JOIN questions q ON q.id = r.question_id
         WHERE r.assessment_id IN (${placeholders})
         GROUP BY r.assessment_id, q.category_id
       ) sub
       JOIN categories c ON c.id = sub.category_id
       GROUP BY c.id
       ORDER BY c.id ASC`,
      ids
    );

    return res.json({
      sector_label: assessment.sector_label,
      sample_size: sampleSize,
      overall_avg_score: overallAvgScore,
      categories: categoryRows.map((r) => ({
        key: r.category_key,
        label: r.category_label,
        avg_score: Math.round(Number(r.avg_score)),
      })),
      insufficient_data: false,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
module.exports.resolveSectorId = resolveSectorId;
module.exports.getGroupedQuestions = getGroupedQuestions;
module.exports.submitAssessmentForUser = submitAssessmentForUser;
