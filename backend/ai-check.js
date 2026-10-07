/**
 * Checks your AI setup without starting the app or touching the database:
 *   - which provider the app will use (from .env)
 *   - for Gemini: the models your key can call, and whether the configured one is among them
 *   - a real sample roadmap, written from made-up answers, showing which engine wrote it
 *
 * Usage (from the backend folder):  npm run ai:check
 */
require('dotenv').config();
const { generateRoadmap, chooseProvider } = require('./services/aiService');

const sample = {
  businessName: 'Sample Bakery',
  sector: 'Food & Beverage',
  totalScore: 33,
  level: 'Digitally Emerging',
  categories: [
    { label: 'Online Presence', key: 'online_presence', yesCount: 0, questionCount: 3, score: 0 },
    { label: 'Digital Payments', key: 'digital_payments', yesCount: 2, questionCount: 3, score: 67 },
    { label: 'Marketing', key: 'marketing', yesCount: 1, questionCount: 3, score: 33 },
    { label: 'Operations', key: 'operations', yesCount: 0, questionCount: 3, score: 0 },
    { label: 'Data Use', key: 'data_use', yesCount: 1, questionCount: 3, score: 33 },
  ],
  answers: [
    { question: 'Do you have a website or listing showing your menu, hours, and location?', tip: '', category: 'Online Presence', answer: 0 },
    { question: 'Can customers find and order from you via Google Maps or a delivery app?', tip: '', category: 'Online Presence', answer: 0 },
    { question: 'Can customers pay by card or tap at the counter?', tip: '', category: 'Digital Payments', answer: 1 },
    { question: 'Can customers order and pay online for pickup or delivery?', tip: '', category: 'Digital Payments', answer: 0 },
    { question: 'Do you send emails or messages to past customers?', tip: '', category: 'Marketing', answer: 0 },
    { question: 'Do you track stock levels digitally instead of by manual count?', tip: '', category: 'Operations', answer: 0 },
    { question: 'Do you track which items sell best using sales data?', tip: '', category: 'Data Use', answer: 0 },
  ],
};

async function listGeminiModels() {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
    headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY.trim() },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Gemini rejected the key (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const { models = [] } = await res.json();
  return models
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''));
}

async function main() {
  const provider = chooseProvider();
  console.log(`Provider the app will use: ${provider || 'none (rule-based roadmap)'}`);

  if (!provider) {
    console.log('\nNo real key found in backend/.env. Add GEMINI_API_KEY=... (free key: https://aistudio.google.com) and run this again.');
  }

  if (provider === 'gemini') {
    const wanted = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
    try {
      const models = await listGeminiModels();
      const flash = models.filter((m) => /flash/.test(m) && !/image|tts|live|audio|embed/.test(m));
      console.log(`Configured model: ${wanted} ${models.includes(wanted) ? '(available)' : '(NOT in your key\'s list — set GEMINI_MODEL to one below)'}`);
      console.log('Flash models your key can use:\n  ' + (flash.join('\n  ') || '(none found)'));
    } catch (err) {
      console.error('Could not list models:', err.message);
    }
  }

  console.log('\nGenerating a sample roadmap...');
  const started = Date.now();
  const roadmap = await generateRoadmap(sample);
  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s. Written by: ${roadmap.generated_by}\n`);
  console.log(roadmap.intro + '\n');
  for (const a of roadmap.actions) {
    console.log(`${a.priority}. ${a.title}  [${a.category}, ${a.timeframe}]\n   ${a.description}\n`);
  }

  if (provider && roadmap.generated_by === 'rules') {
    console.log('The AI call FAILED and the built-in rules were used instead — see the "[ai] ... failed" line above for why.');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
