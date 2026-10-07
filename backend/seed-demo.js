/**
 * Loads clearly-labelled DEMO data so benchmarking, progress tracking and the
 * advisor cohort report have real numbers to show.
 *
 *   node seed-demo.js            create the demo data (stops if it already exists)
 *   node seed-demo.js --reset    remove existing demo data, then create it again
 *   node seed-demo.js --remove   remove all demo data and nothing else
 *   node seed-demo.js --yes      skip the "remote database" confirmation
 *
 * Everything it creates uses an @demo.biztransform.test email address and a
 * business name ending in "(demo)", so it can be told apart from — and removed
 * without touching — real accounts. It goes through the real HTTP API (so
 * scoring, roadmaps and validation are the real code paths) and then backdates
 * timestamps so the history spans several weeks. Roadmap wording uses the
 * built-in rules (AI keys are blanked); nothing is sent to an AI service.
 */
process.env.ANTHROPIC_API_KEY = '';
process.env.GEMINI_API_KEY = '';
process.env.BIZTRANSFORM_NO_LISTEN = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'demo-seed-only-secret';

const DEMO_DOMAIN = 'demo.biztransform.test';
const DEMO_PASSWORD = 'DemoPass123!';
const DAY = 24 * 60 * 60 * 1000;

const args = new Set(process.argv.slice(2));

const BUSINESSES = [
  // name, sector, advisor-linked?, starting maturity (0-1), growth per assessment, assessments
  ['Harbour Bakehouse', 'hospitality', true, 0.3, 0.2, 3],
  ['Corner Brew Cafe', 'hospitality', true, 0.45, 0.15, 3],
  ['Tidewater Kitchen', 'hospitality', false, 0.6, 0.1, 2],
  ['Willow & Co Boutique', 'retail', true, 0.25, 0.22, 3],
  ['Gumtree Gifts', 'retail', false, 0.4, 0.12, 2],
  ['Northside Cycles', 'retail', true, 0.55, 0.12, 2],
  ['Ironbark Plumbing', 'trades', true, 0.15, 0.25, 3],
  ['Spark Electrical', 'trades', false, 0.35, 0.18, 2],
  ['Bright Path Accounting', 'professional_services', true, 0.5, 0.15, 2],
  ['Lantern Legal', 'professional_services', false, 0.65, 0.1, 1],
  ['Flow Yoga Studio', 'health_wellness', true, 0.35, 0.2, 3],
  ['Remedy Physio', 'health_wellness', false, 0.55, 0.1, 2],
  ['Pixel Forge Studio', 'technology', true, 0.7, 0.1, 2],
  ['Bytewise IT Support', 'technology', false, 0.5, 0.15, 2],
  ['Little Learners Tutoring', 'education', false, 0.3, 0.2, 2],
];

// Deterministic pseudo-random numbers, so every run produces the same dataset.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const emailFor = (name) => `${slug(name)}@${DEMO_DOMAIN}`;

async function main() {
  const { query, pool } = require('./db');

  const target = `${process.env.DB_NAME || 'digitalready'} on ${process.env.DB_HOST || 'localhost'}`;
  const isLocal = ['localhost', '127.0.0.1', undefined].includes(process.env.DB_HOST);
  console.log(`Target database: ${target}`);
  if (!isLocal && !args.has('--yes')) {
    console.error('This is not a local database. Re-run with --yes to confirm you mean it.');
    process.exit(1);
  }

  const existing = await query('SELECT COUNT(*) AS n FROM users WHERE email LIKE :pattern', {
    pattern: `%@${DEMO_DOMAIN}`,
  });
  const existingCount = Number(existing[0].n);

  if (args.has('--remove') || args.has('--reset')) {
    await query('DELETE FROM users WHERE email LIKE :pattern', { pattern: `%@${DEMO_DOMAIN}` });
    await query('DELETE FROM audit_log WHERE actor_email LIKE :pattern', { pattern: `%@${DEMO_DOMAIN}` });
    console.log(`Removed ${existingCount} demo account(s) and everything linked to them.`);
    if (args.has('--remove')) {
      await pool.end();
      return;
    }
  } else if (existingCount > 0) {
    console.error(`Demo data already exists (${existingCount} accounts). Use --reset to rebuild it or --remove to delete it.`);
    await pool.end();
    process.exit(1);
  }

  const app = require('./server');
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;

  async function call(method, url, { token, body } = {}) {
    const res = await fetch(base + url, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${JSON.stringify(json)}`);
    return json;
  }

  const backdate = (table, id, when) =>
    query(`UPDATE ${table} SET created_at = :when WHERE id = :id`, { when, id });

  // ---- Advisor ----
  const advisorEmail = emailFor('Demo Advisor');
  const advisor = await call('POST', '/auth/register', {
    body: { name: 'Demo Advisor', email: advisorEmail, password: DEMO_PASSWORD, role: 'advisor' },
  });
  await query('UPDATE users SET created_at = :when WHERE id = :id', {
    when: new Date(Date.now() - 90 * DAY),
    id: advisor.user.id,
  });

  const created = [];

  // ---- Businesses and their assessment history ----
  for (let i = 0; i < BUSINESSES.length; i += 1) {
    const [name, sector, linked, start, growth, count] = BUSINESSES[i];
    const rand = rng(1000 + i);

    const reg = await call('POST', '/auth/register', {
      body: {
        name: `${name.split(' ')[0]} Owner`,
        email: emailFor(name),
        password: DEMO_PASSWORD,
        role: 'business',
        business_name: `${name} (demo)`,
        sector,
        advisor_code: linked ? advisor.user.advisor_code : undefined,
      },
    });
    const token = reg.token;

    const joined = new Date(Date.now() - (75 - i * 2) * DAY);
    await backdate('users', reg.user.id, joined);

    const { categories } = await call('GET', '/questions', { token });
    const questions = categories.flatMap((c) => c.questions);
    // Each question gets a fixed "difficulty"; a business answers Yes once its
    // maturity passes it. That makes scores rise over time, as they would for a
    // business that is genuinely acting on its roadmap.
    const difficulty = questions.map(() => rand());

    const assessmentIds = [];
    for (let k = 0; k < count; k += 1) {
      const maturity = Math.min(0.97, start + growth * k + (rand() - 0.5) * 0.06);
      const responses = questions.map((q, qi) => ({
        question_id: q.id,
        answer: difficulty[qi] <= maturity ? 1 : 0,
      }));
      const result = await call('POST', '/assessments', { token, body: { responses } });
      const weeksAgo = (count - 1 - k) * 3 + 1 + Math.floor(rand() * 2);
      const when = new Date(Math.max(joined.getTime() + DAY, Date.now() - weeksAgo * 7 * DAY));
      await backdate('assessments', result.id, when);
      assessmentIds.push({ id: result.id, when, score: result.total_score });
    }

    // Roadmap on the first assessment, partly worked through.
    const first = assessmentIds[0];
    const roadmap = await call('POST', `/assessments/${first.id}/roadmap`, { token, body: {} });
    await backdate('roadmaps', (await query('SELECT id FROM roadmaps WHERE assessment_id = :id', { id: first.id }))[0].id, first.when);
    const actions = roadmap.content.actions;
    const doneCount = count > 1 ? Math.min(actions.length, 1 + Math.floor(rand() * actions.length)) : 0;
    for (let a = 0; a < doneCount; a += 1) {
      const cost = Math.round((50 + rand() * 450) / 10) * 10;
      const benefit = Math.round((cost * (1.5 + rand() * 4)) / 10) * 10;
      await call('PATCH', `/assessments/${first.id}/roadmap/actions/${a}`, {
        token,
        body: { completed: true, cost, expected_benefit: benefit },
      });
    }
    // The latest assessment also gets a roadmap, with nothing done yet.
    if (count > 1) {
      const last = assessmentIds[assessmentIds.length - 1];
      await call('POST', `/assessments/${last.id}/roadmap`, { token, body: {} });
      await backdate('roadmaps', (await query('SELECT id FROM roadmaps WHERE assessment_id = :id', { id: last.id }))[0].id, last.when);
    }

    // A website check for roughly two thirds of them (fake .example addresses,
    // inserted directly — the real checker would refuse to fetch them).
    if (rand() < 0.7) {
      const good = rand();
      await query(
        `INSERT INTO website_audits
           (user_id, url, status, https, mobile_friendly, has_title, has_meta_description,
            payment_detected, social_links_found, response_time_ms, created_at)
         VALUES (:user_id, :url, 'ok', :https, :mobile, :title, :meta, :payment, :social, :ms, :when)`,
        {
          user_id: reg.user.id,
          url: `https://${slug(name)}.example`,
          https: good > 0.15 ? 1 : 0,
          mobile: good > 0.3 ? 1 : 0,
          title: 1,
          meta: good > 0.45 ? 1 : 0,
          payment: good > 0.6 ? 1 : 0,
          social: ['facebook', 'instagram', 'linkedin'].filter(() => rand() > 0.4).join(','),
          ms: Math.round(300 + rand() * 1800),
          when: new Date(Date.now() - Math.floor(rand() * 20) * DAY),
        }
      );
    }

    created.push({ ...reg.user, linked, scores: assessmentIds.map((a) => a.score) });
  }

  // ---- Advisor follow-up statuses and notes ----
  const clients = created.filter((c) => c.linked);
  const statuses = ['on_track', 'needs_follow_up', 'on_track', 'resolved', 'needs_follow_up'];
  const noteBank = [
    'Walked through the roadmap together. First priority is getting online payments switched on.',
    'Booked a follow-up in two weeks to review the Google Business Profile changes.',
    'Good progress since the last session. Suggested a simple monthly sales report next.',
    'Owner is time-poor, so we agreed to focus on one action at a time.',
  ];
  for (let i = 0; i < clients.length; i += 1) {
    const c = clients[i];
    await call('PATCH', `/admin/businesses/${c.id}/status`, {
      token: advisor.token,
      body: { status: statuses[i % statuses.length] },
    });
    const noteCount = 1 + (i % 2);
    for (let n = 0; n < noteCount; n += 1) {
      const note = await call('POST', `/notes/${c.id}`, {
        token: advisor.token,
        body: { content: noteBank[(i + n) % noteBank.length] },
      });
      const noteId = note.id || note.note?.id;
      if (noteId) await backdate('advisor_notes', noteId, new Date(Date.now() - (6 + n * 9 + i) * DAY));
    }
  }

  // ---- One client the advisor created who hasn't claimed their account ----
  await call('POST', '/admin/businesses', {
    token: advisor.token,
    body: {
      name: 'Walk-in Owner',
      email: emailFor('Sunrise Florist'),
      business_name: 'Sunrise Florist (demo)',
      sector: 'retail',
    },
  });

  await new Promise((resolve) => server.close(resolve));
  await pool.end();

  console.log(`\nCreated ${BUSINESSES.length} demo businesses, 1 demo advisor and 1 unclaimed client.`);
  console.log(`\nDemo advisor login : ${advisorEmail}`);
  console.log(`Demo business login: ${emailFor(BUSINESSES[0][0])}`);
  console.log(`Shared demo password: ${DEMO_PASSWORD}`);
  console.log('\nRemove it all later with: node seed-demo.js --remove');
}

main().catch((err) => {
  console.error('Demo seed failed:', err.message);
  process.exit(1);
});
