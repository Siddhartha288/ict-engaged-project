const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { generateRoadmap, chooseProvider, parseRoadmapContent } = require('../services/aiService');

const ENV_KEYS = ['GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'AI_PROVIDER', 'GEMINI_MODEL', 'ANTHROPIC_MODEL'];
const realFetch = global.fetch;
let saved;
let calls;

const assessment = {
  businessName: 'Test Cafe',
  sector: 'Food & Beverage',
  totalScore: 40,
  level: 'Digitally Emerging',
  categories: [
    { label: 'Online Presence', key: 'online_presence', yesCount: 0, questionCount: 3, score: 0 },
    { label: 'Digital Payments', key: 'digital_payments', yesCount: 2, questionCount: 3, score: 67 },
    { label: 'Marketing', key: 'marketing', yesCount: 1, questionCount: 3, score: 33 },
  ],
  answers: [
    { question: 'Do you have a website?', tip: 'Build a one-page site.', category: 'Online Presence', answer: 0 },
    { question: 'Can customers pay by card?', tip: 'Get a terminal.', category: 'Digital Payments', answer: 1 },
    { question: 'Do you send emails to customers?', tip: 'Start a mailing list.', category: 'Marketing', answer: 0 },
  ],
};

const goodRoadmap = {
  intro: 'Test Cafe is just starting out online.',
  actions: [
    { title: 'Build a site', priority: 1, timeframe: '1-2 weeks', category: 'online presence', description: 'You answered No to having a website.' },
    { title: 'Start a list', priority: 2, timeframe: '2 weeks', category: 'Marketing', description: 'You do not email customers.' },
    { title: 'Third action', priority: 3, timeframe: '1 week', category: 'Digital Payments', description: 'Keep going.' },
  ],
};

function stubFetch(handler) {
  calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return handler(String(url), options);
  };
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const geminiReply = (text) => json({ candidates: [{ content: { parts: [{ text }] } }] });
const claudeReply = (text) => json({ content: [{ type: 'text', text }] });

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  global.fetch = realFetch;
});

describe('AI provider choice', () => {
  it('uses the rule-based roadmap, without any network call, when no key is set', async () => {
    stubFetch(() => assert.fail('must not call the network'));
    const roadmap = await generateRoadmap(assessment);
    assert.equal(roadmap.generated_by, 'rules');
    assert.ok(roadmap.actions.length >= 3);
    assert.equal(calls.length, 0);
  });

  it('ignores placeholder keys from .env.example', () => {
    process.env.GEMINI_API_KEY = 'your_gemini_api_key';
    process.env.ANTHROPIC_API_KEY = 'your_anthropic_api_key';
    assert.equal(chooseProvider(), null);
  });

  it('prefers Gemini when both keys exist, unless AI_PROVIDER says otherwise', () => {
    process.env.GEMINI_API_KEY = 'g-key';
    process.env.ANTHROPIC_API_KEY = 'c-key';
    assert.equal(chooseProvider(), 'gemini');
    process.env.AI_PROVIDER = 'anthropic';
    assert.equal(chooseProvider(), 'anthropic');
  });
});

describe('Gemini', () => {
  it('sends the key as a header (not in the URL) and returns the AI roadmap with vendor links attached', async () => {
    process.env.GEMINI_API_KEY = 'secret-gemini-key';
    process.env.GEMINI_MODEL = 'gemini-test-model';
    stubFetch(() => geminiReply(JSON.stringify(goodRoadmap)));

    const roadmap = await generateRoadmap(assessment);

    assert.equal(roadmap.generated_by, 'gemini');
    assert.equal(roadmap.intro, goodRoadmap.intro);
    assert.equal(roadmap.actions.length, 3);
    assert.equal(roadmap.actions[0].category, 'Online Presence', 'category snapped to the real label');
    assert.ok(roadmap.actions[0].resources?.length > 0, 'curated vendor links attached');

    assert.match(calls[0].url, /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-test-model:generateContent$/);
    assert.ok(!calls[0].url.includes('secret-gemini-key'));
    assert.equal(calls[0].options.headers['x-goog-api-key'], 'secret-gemini-key');
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
    assert.match(body.contents[0].parts[0].text, /Do you have a website\?: No/);
  });

  it('accepts JSON wrapped in code fences or a preamble', async () => {
    process.env.GEMINI_API_KEY = 'g-key';
    stubFetch(() => geminiReply('Here is your plan:\n```json\n' + JSON.stringify(goodRoadmap) + '\n```'));
    assert.equal((await generateRoadmap(assessment)).generated_by, 'gemini');
  });

  it('falls back to the rule-based roadmap on a rate limit', async () => {
    process.env.GEMINI_API_KEY = 'g-key';
    stubFetch(() => json({ error: { message: 'quota exceeded' } }, 429));
    const roadmap = await generateRoadmap(assessment);
    assert.equal(roadmap.generated_by, 'rules');
    assert.ok(roadmap.actions.length >= 3);
  });

  it('falls back when the reply is unusable, empty, or the network fails', async () => {
    process.env.GEMINI_API_KEY = 'g-key';
    for (const handler of [
      () => geminiReply('Sorry, I cannot help with that.'),
      () => geminiReply(JSON.stringify({ intro: 'no actions' })),
      () => json({ candidates: [] }),
      () => {
        throw new Error('network down');
      },
    ]) {
      stubFetch(handler);
      assert.equal((await generateRoadmap(assessment)).generated_by, 'rules');
    }
  });
});

describe('Claude', () => {
  it('is used when only an Anthropic key is set, with a configurable model', async () => {
    process.env.ANTHROPIC_API_KEY = 'c-key';
    process.env.ANTHROPIC_MODEL = 'claude-test-model';
    stubFetch(() => claudeReply(JSON.stringify(goodRoadmap)));

    const roadmap = await generateRoadmap(assessment);

    assert.equal(roadmap.generated_by, 'claude');
    assert.match(calls[0].url, /api\.anthropic\.com/);
    assert.equal(JSON.parse(calls[0].options.body).model, 'claude-test-model');
  });

  it('falls back to rules on an API error', async () => {
    process.env.ANTHROPIC_API_KEY = 'c-key';
    stubFetch(() => json({ error: 'bad key' }, 401));
    assert.equal((await generateRoadmap(assessment)).generated_by, 'rules');
  });
});

describe('parseRoadmapContent', () => {
  it('rejects replies that are not a usable roadmap', () => {
    assert.throws(() => parseRoadmapContent('not json at all', assessment));
    assert.throws(() => parseRoadmapContent('{"intro":"x","actions":[]}', assessment));
  });

  it('keeps at most 5 actions', () => {
    const many = { intro: 'x', actions: Array.from({ length: 9 }, (_, i) => ({ title: `A${i}`, description: 'd' })) };
    assert.equal(parseRoadmapContent(JSON.stringify(many), assessment).actions.length, 5);
  });
});
