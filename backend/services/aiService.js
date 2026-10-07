/**
 * AI roadmap generation — isolated so the provider can be swapped.
 *
 * Providers, in order of preference (the first one with a real key is used):
 *   1. Google Gemini   — GEMINI_API_KEY    (has a free tier)
 *   2. Anthropic Claude — ANTHROPIC_API_KEY
 * Set AI_PROVIDER=gemini|anthropic to force one when both keys are present.
 *
 * If no key is set, or the call fails for any reason (bad key, rate limit,
 * timeout, unusable reply), a local rule-based roadmap is returned instead, so
 * the app never breaks. The result says which engine wrote it in `generated_by`
 * ('gemini' | 'claude' | 'rules').
 */
const { attachResources } = require('./resourceLinks');

const REQUEST_TIMEOUT_MS = 30 * 1000;
// "-latest" aliases follow Google's current Flash-Lite model (about 3s per roadmap; the full Flash model took ~18s), so the default doesn't
// break when an individual model version is retired. Override with GEMINI_MODEL.
const DEFAULT_GEMINI_MODEL = 'gemini-flash-lite-latest';
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5-5';

function realKey(value) {
  return Boolean(value && value.trim() && !value.includes('your_'));
}

function chooseProvider() {
  const hasGemini = realKey(process.env.GEMINI_API_KEY);
  const hasClaude = realKey(process.env.ANTHROPIC_API_KEY);
  const forced = (process.env.AI_PROVIDER || '').trim().toLowerCase();
  if (forced === 'gemini' && hasGemini) return 'gemini';
  if (forced === 'anthropic' && hasClaude) return 'anthropic';
  if (hasGemini) return 'gemini';
  if (hasClaude) return 'anthropic';
  return null;
}

async function generateRoadmap(assessmentData) {
  const provider = chooseProvider();

  if (!provider) {
    console.warn('[ai] no GEMINI_API_KEY or ANTHROPIC_API_KEY set — using rule-based roadmap');
    return withSource(attachResources(buildLocalRoadmap(assessmentData)), 'rules');
  }

  try {
    const prompt = buildPrompt(assessmentData);
    const text =
      provider === 'gemini' ? await callGemini(prompt) : await callAnthropic(prompt);
    const roadmap = parseRoadmapContent(text, assessmentData);
    console.log(`[ai] roadmap written by ${provider}`);
    return withSource(attachResources(roadmap), provider === 'gemini' ? 'gemini' : 'claude');
  } catch (err) {
    console.error(`[ai] ${provider} failed, using rule-based roadmap:`, err.message);
    return withSource(attachResources(buildLocalRoadmap(assessmentData)), 'rules');
  }
}

function withSource(roadmap, source) {
  return { ...roadmap, generated_by: source };
}

function buildPrompt(assessmentData) {
  const { businessName, sector, totalScore, level, categories, answers } = assessmentData;

  const weakCategories = (categories || [])
    .filter((c) => Number(c.score) < 67)
    .sort((a, b) => Number(a.score) - Number(b.score))
    .map((c) => `${c.label} (${c.score}%)`)
    .join(', ');

  const categorySummary = (categories || [])
    .map((c) => `- ${c.label}: ${c.score}% (${c.yesCount}/${c.questionCount} yes)`)
    .join('\n');

  const answerLines = (answers || [])
    .map((a) => `- [${a.category}] ${a.question}: ${a.answer === 1 ? 'Yes' : 'No'}`)
    .join('\n');

  const categoryLabels = (categories || []).map((c) => c.label).join(', ');

  return `You are a practical digital advisor for small businesses. Avoid generic fluff.

Business: ${businessName || 'a small business'}${sector ? ` (sector: ${sector})` : ''}
Overall digital maturity: ${totalScore}% — level "${level}"
Weakest / focus areas: ${weakCategories || 'none clearly weak'}

Category scores:
${categorySummary}

Assessment answers:
${answerLines}

Write a personalized action roadmap as JSON only (no markdown fences), with this exact shape:
{
  "intro": "2-3 sentences referencing their specific weak areas and overall level",
  "actions": [
    {
      "title": "short action title",
      "priority": 1,
      "timeframe": "1-2 weeks",
      "category": "matching category label",
      "description": "concrete steps they can do this week/month"
    }
  ]
}

Rules:
- Include 3 to 5 prioritized actions (priority 1 = highest).
- Each action must be specific and doable within 1-4 weeks.
- The "category" of each action must be exactly one of: ${categoryLabels || 'the category labels above'}.
- Tailor suggestions and examples to the business's sector where relevant (tools, channels, workflows typical for that sector).
- Prioritize weak categories first.
- Reference their actual No answers where useful.
- Every action's description must name at least one specific "No" answer from THIS business's
  assessment and address it directly - do not write an action that could apply to any business
  regardless of their answers.
- Do not invent tools they must buy unless free/low-cost options exist.`;
}

async function callGemini(prompt) {
  const model = (process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY.trim(),
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API error (${response.status}): ${(await response.text()).slice(0, 300)}`);
  }

  const data = await response.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p.text || '').join('\n').trim();
  if (!text) throw new Error('Gemini returned no text (blocked or empty response)');
  return text;
}

async function callAnthropic(prompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY.trim(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: (process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL).trim(),
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error (${response.status}): ${(await response.text()).slice(0, 300)}`);
  }

  const data = await response.json();
  const text = (data.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
  if (!text) throw new Error('Anthropic returned no text');
  return text;
}

function buildLocalRoadmap(assessmentData) {
  const {
    businessName,
    sector,
    totalScore,
    level,
    categories = [],
    answers = [],
  } = assessmentData;

  const sorted = [...categories].sort((a, b) => Number(a.score) - Number(b.score));
  const weak = sorted.filter((c) => Number(c.score) < 67);
  const focus = (weak.length ? weak : sorted).slice(0, 4);

  const playbooks = {
    'Online Presence': { title: 'Get findable online this week', timeframe: '1-2 weeks' },
    'Digital Payments': { title: 'Turn on a simple digital payment option', timeframe: '1-2 weeks' },
    Marketing: { title: 'Start a basic customer follow-up loop', timeframe: '2 weeks' },
    Operations: { title: 'Move one routine process into a shared digital tool', timeframe: '1-3 weeks' },
    'Data Use': { title: 'Track three numbers every week', timeframe: '1-2 weeks' },
  };

  // Builds a description entirely from THIS business's actual "No" answers in a category,
  // using each question's sector-specific tip (from the DB) rather than a fixed paragraph
  // that's the same regardless of which questions failed.
  function describeCategoryGaps(categoryLabel) {
    const noAnswers = answers.filter((a) => a.category === categoryLabel && a.answer === 0);
    if (noAnswers.length === 0) return null;

    const tips = noAnswers.map((a) => a.tip || a.question);
    if (tips.length === 1) return tips[0];
    return tips.map((t, i) => `${i + 1}) ${t}`).join(' ');
  }

  const actions = focus.map((cat, i) => {
    const book = playbooks[cat.label] || { title: `Improve ${cat.label}`, timeframe: '2 weeks' };
    const gapDescription = describeCategoryGaps(cat.label);

    return {
      title: book.title,
      priority: i + 1,
      timeframe: book.timeframe,
      category: cat.label,
      description:
        gapDescription ||
        `Your ${cat.label} score is ${cat.score}%. Pick one concrete improvement from that area and finish it within two weeks.`,
    };
  });

  while (actions.length < 3 && sorted[actions.length]) {
    const cat = sorted[actions.length];
    const book = playbooks[cat.label];
    if (book && !actions.some((a) => a.category === cat.label)) {
      actions.push({
        title: book.title,
        priority: actions.length + 1,
        timeframe: book.timeframe,
        category: cat.label,
        description:
          describeCategoryGaps(cat.label) ||
          `Your ${cat.label} score is ${cat.score}%. Pick one concrete improvement from that area and finish it within two weeks.`,
      });
    } else {
      break;
    }
  }

  const weakLabels = focus.map((c) => `${c.label} (${c.score}%)`).join(', ');
  const name = businessName || 'Your business';
  const sectorPhrase = sector ? ` in the ${sector} sector` : '';

  return {
    intro: `${name}${sectorPhrase} is currently at “${level}” with an overall score of ${totalScore}%. The biggest opportunities are in ${weakLabels || 'a few core digital areas'}. Below is a practical 1–4 week plan you can start immediately.`,
    actions: actions.slice(0, 5),
  };
}

// Strict on purpose: if the model's reply isn't a usable roadmap this throws, and
// the caller falls back to the rule-based roadmap, which is better than showing
// a half-parsed blob.
function parseRoadmapContent(text, assessmentData = {}) {
  let cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!cleaned.startsWith('{')) {
    // Tolerate a short preamble before the JSON.
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('Reply contained no JSON object');
    cleaned = cleaned.slice(start, end + 1);
  }

  const parsed = JSON.parse(cleaned);
  if (!parsed.intro || !Array.isArray(parsed.actions) || parsed.actions.length === 0) {
    throw new Error('Reply is missing "intro" or "actions"');
  }

  // Snap each action's category to one of the real labels (case-insensitive) so
  // the curated vendor links in resourceLinks.js attach correctly.
  const labels = (assessmentData.categories || []).map((c) => c.label);
  const snap = (value) => labels.find((l) => l.toLowerCase() === String(value || '').trim().toLowerCase()) || String(value || '');

  return {
    intro: String(parsed.intro),
    actions: parsed.actions.slice(0, 5).map((a, i) => ({
      title: String(a.title || `Action ${i + 1}`),
      priority: Number(a.priority) || i + 1,
      timeframe: String(a.timeframe || '1-2 weeks'),
      category: snap(a.category),
      description: String(a.description || ''),
    })),
  };
}

module.exports = { generateRoadmap, parseRoadmapContent, chooseProvider };
