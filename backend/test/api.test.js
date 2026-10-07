const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const { startApp, uniqueEmail } = require('./helpers');

let app;
let request;

const PASSWORD = 'TestPass123';

async function register(overrides = {}) {
  const email = overrides.email || uniqueEmail(overrides.role || 'biz');
  const res = await request('POST', '/auth/register', {
    body: {
      name: 'Test User',
      email,
      password: PASSWORD,
      role: 'business',
      business_name: 'Test Co',
      sector: 'retail',
      ...overrides,
    },
  });
  assert.equal(res.status, 201, `register failed: ${JSON.stringify(res.body)}`);
  return { token: res.body.token, user: res.body.user, email };
}

const registerAdvisor = () => register({ role: 'advisor', sector: undefined, business_name: undefined });

async function createAdmin() {
  const email = uniqueEmail('admin');
  const hash = await bcrypt.hash(PASSWORD, 4);
  const result = await app.db.query(
    "INSERT INTO users (name, email, password_hash, role) VALUES ('Admin', :email, :hash, 'admin')",
    { email, hash }
  );
  const login = await request('POST', '/auth/login', { body: { email, password: PASSWORD } });
  return { token: login.body.token, id: result.insertId, email };
}

async function questionsFor(token) {
  const res = await request('GET', '/questions', { token });
  assert.equal(res.status, 200);
  return res.body.categories.flatMap((c) => c.questions);
}

// answers(questions) -> array of 0/1, one per question in order
async function submitAssessment(token, answers) {
  const questions = await questionsFor(token);
  const responses = questions.map((q, i) => ({ question_id: q.id, answer: answers(i) }));
  return request('POST', '/assessments', { token, body: { responses } });
}

before(async () => {
  app = await startApp();
  request = app.request;
});

after(async () => {
  await app.stop();
});

describe('authentication', () => {
  it('rejects self-registering as an admin', async () => {
    const res = await request('POST', '/auth/register', {
      body: { name: 'X', email: uniqueEmail('evil'), password: PASSWORD, role: 'admin' },
    });
    assert.equal(res.status, 400);
  });

  it('requires a sector for business accounts, and a real one', async () => {
    const base = { name: 'X', password: PASSWORD, role: 'business' };
    const missing = await request('POST', '/auth/register', { body: { ...base, email: uniqueEmail('a') } });
    assert.equal(missing.status, 400);
    const unknown = await request('POST', '/auth/register', {
      body: { ...base, email: uniqueEmail('b'), sector: 'not-a-sector' },
    });
    assert.equal(unknown.status, 400);
  });

  it('registers, stores a bcrypt hash (never the password), and logs in', async () => {
    const { email, user } = await register();
    assert.equal(user.role, 'business');
    assert.equal(user.sector_key, 'retail');

    const [row] = await app.db.query('SELECT password_hash FROM users WHERE email = :email', { email });
    assert.match(row.password_hash, /^\$2[aby]\$/);
    assert.notEqual(row.password_hash, PASSWORD);

    const login = await request('POST', '/auth/login', { body: { email, password: PASSWORD } });
    assert.equal(login.status, 200);
    assert.ok(login.body.token);
  });

  it('rejects a wrong password and a duplicate email', async () => {
    const { email } = await register();
    const bad = await request('POST', '/auth/login', { body: { email, password: 'wrong-password' } });
    assert.equal(bad.status, 401);
    const dup = await request('POST', '/auth/register', {
      body: { name: 'X', email, password: PASSWORD, role: 'business', sector: 'retail' },
    });
    assert.equal(dup.status, 400);
  });

  it('refuses protected routes without a valid token', async () => {
    assert.equal((await request('GET', '/questions')).status, 401);
    assert.equal((await request('GET', '/questions', { token: 'not-a-real-token' })).status, 401);
  });
});

describe('role-based access control', () => {
  it('keeps each role out of the other roles’ APIs', async () => {
    const business = await register();
    const advisor = await registerAdvisor();
    const admin = await createAdmin();

    assert.equal((await request('GET', '/admin/businesses', { token: business.token })).status, 403);
    assert.equal((await request('GET', '/platform/stats', { token: business.token })).status, 403);
    assert.equal((await request('GET', '/platform/stats', { token: advisor.token })).status, 403);

    assert.equal((await request('GET', '/admin/businesses', { token: advisor.token })).status, 200);
    assert.equal((await request('GET', '/platform/stats', { token: admin.token })).status, 200);
  });
});

describe('assessment and scoring', () => {
  it('serves 15 questions, tailored per sector', async () => {
    const retail = await register({ sector: 'retail' });
    const food = await register({ sector: 'hospitality' });
    const retailQs = await questionsFor(retail.token);
    const foodQs = await questionsFor(food.token);
    assert.equal(retailQs.length, 15);
    assert.equal(foodQs.length, 15);
    assert.notEqual(retailQs[0].text, foodQs[0].text);
  });

  it('rejects incomplete, duplicate and unknown responses', async () => {
    const { token } = await register();
    const questions = await questionsFor(token);

    const incomplete = await request('POST', '/assessments', {
      token,
      body: { responses: questions.slice(0, 5).map((q) => ({ question_id: q.id, answer: 1 })) },
    });
    assert.equal(incomplete.status, 400);

    const dup = await request('POST', '/assessments', {
      token,
      body: { responses: [{ question_id: questions[0].id, answer: 1 }, { question_id: questions[0].id, answer: 0 }] },
    });
    assert.equal(dup.status, 400);

    const unknown = await request('POST', '/assessments', {
      token,
      body: { responses: [{ question_id: 999999, answer: 1 }] },
    });
    assert.equal(unknown.status, 400);
  });

  it('scores all-yes as 100 (Digital Ready) and all-no as 0 (Foundation Needed)', async () => {
    const { token } = await register();
    const yes = await submitAssessment(token, () => 1);
    assert.equal(yes.status, 201);
    assert.equal(yes.body.total_score, 100);
    assert.equal(yes.body.level, 'Digital Ready');

    const no = await submitAssessment(token, () => 0);
    assert.equal(no.body.total_score, 0);
    assert.equal(no.body.level, 'Foundation Needed');
  });

  it('computes per-category scores and the level boundary correctly', async () => {
    const { token } = await register();
    // 3 questions per category; answering 2 of every 3 "yes" -> 67% in each.
    const res = await submitAssessment(token, (i) => (i % 3 === 2 ? 0 : 1));
    assert.equal(res.body.total_score, 67);
    assert.equal(res.body.level, 'Digitally Growing');
    assert.equal(res.body.categories.length, 5);
    assert.ok(res.body.categories.every((c) => c.score === 67));
  });

  it('lets a user read their own assessment but not someone else’s', async () => {
    const owner = await register();
    const other = await register();
    const created = await submitAssessment(owner.token, () => 1);
    assert.equal((await request('GET', `/assessments/${created.body.id}`, { token: owner.token })).status, 200);
    assert.equal((await request('GET', `/assessments/${created.body.id}`, { token: other.token })).status, 403);
  });
});

describe('roadmap', () => {
  it('generates a sector-aware roadmap and tracks progress, cost and benefit', async () => {
    const { token } = await register({ sector: 'trades' });
    const assessment = await submitAssessment(token, () => 0);
    const id = assessment.body.id;

    const created = await request('POST', `/assessments/${id}/roadmap`, { token, body: {} });
    assert.equal(created.status, 201);
    assert.match(created.body.content.intro, /Trades & Home Services/);
    assert.ok(created.body.content.actions.length >= 3);
    assert.ok(created.body.content.actions.every((a) => a.completed === false));

    const done = await request('PATCH', `/assessments/${id}/roadmap/actions/0`, { token, body: { completed: true } });
    assert.equal(done.status, 200);
    const money = await request('PATCH', `/assessments/${id}/roadmap/actions/0`, {
      token,
      body: { cost: 500, expected_benefit: 2000 },
    });
    assert.equal(money.status, 200);

    const fetched = await request('GET', `/assessments/${id}/roadmap`, { token });
    const first = fetched.body.content.actions[0];
    assert.equal(first.completed, true, 'a later partial update must not reset completion');
    assert.equal(first.cost, 500);
    assert.equal(first.expected_benefit, 2000);
  });

  it('rejects invalid money values and out-of-range actions', async () => {
    const { token } = await register();
    const id = (await submitAssessment(token, () => 0)).body.id;
    await request('POST', `/assessments/${id}/roadmap`, { token, body: {} });
    assert.equal((await request('PATCH', `/assessments/${id}/roadmap/actions/0`, { token, body: { cost: -5 } })).status, 400);
    assert.equal((await request('PATCH', `/assessments/${id}/roadmap/actions/99`, { token, body: { completed: true } })).status, 400);
  });
});

describe('sector benchmarking', () => {
  it('needs at least three businesses, then averages them and flags a small sample', async () => {
    const a = await register({ sector: 'education' });
    const first = await submitAssessment(a.token, () => 1);
    const bench = () => request('GET', `/assessments/${first.body.id}/benchmark`, { token: a.token });
    assert.equal((await bench()).body.insufficient_data, true);

    const b = await register({ sector: 'education' });
    await submitAssessment(b.token, () => 0);
    const two = await bench();
    assert.equal(two.body.insufficient_data, true, 'two businesses is not enough to compare');
    assert.equal(two.body.sample_size, 2);

    const c = await register({ sector: 'education' });
    await submitAssessment(c.token, () => 0);
    const three = await bench();
    assert.equal(three.body.insufficient_data, false);
    assert.equal(three.body.sample_size, 3);
    assert.equal(three.body.overall_avg_score, 33);
    assert.equal(three.body.small_sample, true, 'fewer than 10 businesses is flagged as indicative only');
    assert.equal(three.body.includes_demo, false);
  });
});

describe('advisor caseload, sessions and the claim flow', () => {
  it('links businesses by invite code and scopes the portal to "my clients"', async () => {
    const advisor = await registerAdvisor();
    assert.match(advisor.user.advisor_code, /^[A-Z0-9]{6}$/);

    const linked = await register({ advisor_code: advisor.user.advisor_code });
    const loose = await register();
    const bad = await request('POST', '/auth/register', {
      body: { name: 'X', email: uniqueEmail('x'), password: PASSWORD, role: 'business', sector: 'retail', advisor_code: 'ZZZZZZ' },
    });
    assert.equal(bad.status, 400);

    const mine = await request('GET', '/admin/businesses', { token: advisor.token });
    assert.deepEqual(mine.body.businesses.map((b) => b.email), [linked.email]);

    // There is no "all businesses" view any more: an advisor only ever sees their own clients.
    const all = await request('GET', '/admin/businesses?all=1', { token: advisor.token });
    assert.deepEqual(all.body.businesses.map((b) => b.email), [linked.email]);
    assert.ok(!all.body.businesses.some((b) => b.email === loose.email));
  });

  it('lets an advisor run an assessment for a client who later claims the account', async () => {
    const advisor = await registerAdvisor();
    const email = uniqueEmail('walkin');
    const created = await request('POST', '/admin/businesses', {
      token: advisor.token,
      body: { name: 'Walk In', email, business_name: 'Cafe', sector: 'hospitality' },
    });
    assert.equal(created.status, 201);
    const clientId = created.body.id;

    // Unclaimed accounts have no password, so nobody can log in as them.
    assert.equal((await request('POST', '/auth/login', { body: { email, password: PASSWORD } })).status, 401);

    const qs = await request('GET', `/admin/businesses/${clientId}/questions`, { token: advisor.token });
    const questions = qs.body.categories.flatMap((c) => c.questions);
    assert.equal(questions.length, 15);
    const submitted = await request('POST', `/admin/businesses/${clientId}/assessments`, {
      token: advisor.token,
      body: { responses: questions.map((q) => ({ question_id: q.id, answer: 1 })) },
    });
    assert.equal(submitted.status, 201);
    assert.equal(submitted.body.total_score, 100);

    // The email alone is no longer enough: the advisor hands the client a claim code.
    assert.match(created.body.claim_code, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    assert.equal((await request('POST', '/auth/claim', { body: { email, password: PASSWORD } })).status, 400, 'email only');
    assert.equal((await request('POST', '/auth/claim', { body: { email, password: PASSWORD, claim_code: 'AAAA-AAAA' } })).status, 400, 'wrong code');

    const claimed = await request('POST', '/auth/claim', { body: { email, password: PASSWORD, claim_code: created.body.claim_code } });
    assert.equal(claimed.status, 200);
    const mine = await request('GET', '/assessments', { token: claimed.body.token });
    assert.equal(mine.body.assessments.length, 1, 'client sees the assessment the advisor recorded');

    assert.equal((await request('POST', '/auth/claim', { body: { email, password: 'AnotherPass1', claim_code: created.body.claim_code } })).status, 400, 'a code works once');
  });

  it('reports cohort impact as the average improvement across the caseload', async () => {
    const advisor = await registerAdvisor();
    const client = await register({ advisor_code: advisor.user.advisor_code });
    await submitAssessment(client.token, () => 0);
    await submitAssessment(client.token, () => 1);

    const impact = await request('GET', '/admin/impact', { token: advisor.token });
    assert.equal(impact.body.caseload_size, 1);
    assert.equal(impact.body.average_current_score, 100);
    assert.equal(impact.body.average_improvement, 100);
  });
});

describe('advisor notes', () => {
  it('lets advisors write notes that only the owning business can read', async () => {
    const advisor = await registerAdvisor();
    const owner = await register({ advisor_code: advisor.user.advisor_code });
    const stranger = await register();

    const posted = await request('POST', `/notes/${owner.user.id}`, { token: advisor.token, body: { content: 'Nice progress.' } });
    assert.equal(posted.status, 201);

    const own = await request('GET', `/notes/${owner.user.id}`, { token: owner.token });
    assert.equal(own.body.notes.length, 1);
    assert.equal((await request('GET', `/notes/${owner.user.id}`, { token: stranger.token })).status, 403);
    assert.equal((await request('POST', `/notes/${owner.user.id}`, { token: owner.token, body: { content: 'x' } })).status, 403);
  });
});

describe('website audit API', () => {
  it('refuses to audit internal addresses and rate-limits repeat runs', async () => {
    const { token } = await register();
    const first = await request('POST', '/audit', { token, body: { url: 'http://169.254.169.254/latest/meta-data/' } });
    assert.equal(first.status, 201);
    assert.equal(first.body.status, 'unreachable');
    assert.match(first.body.error_message, /private|internal/i);

    const second = await request('POST', '/audit', { token, body: { url: 'http://127.0.0.1' } });
    assert.equal(second.status, 429);
  });

  it('is only available to business accounts', async () => {
    const advisor = await registerAdvisor();
    assert.equal((await request('POST', '/audit', { token: advisor.token, body: { url: 'example.com' } })).status, 403);
  });

  it('rejects malformed URLs', async () => {
    const { token } = await register();
    const res = await request('POST', '/audit', { token, body: { url: 'ftp://example.com' } });
    assert.equal(res.status, 400);
  });
});

describe('admin portal', () => {
  it('deactivation takes effect immediately on an existing token, and blocks login', async () => {
    const admin = await createAdmin();
    const victim = await register();
    assert.equal((await request('GET', '/questions', { token: victim.token })).status, 200);

    const off = await request('PATCH', `/platform/users/${victim.user.id}/active`, { token: admin.token, body: { active: false } });
    assert.equal(off.status, 200);
    assert.equal((await request('GET', '/questions', { token: victim.token })).status, 401);
    assert.equal((await request('POST', '/auth/login', { body: { email: victim.email, password: PASSWORD } })).status, 403);

    // A wrong password on a deactivated account must not reveal its status.
    assert.equal((await request('POST', '/auth/login', { body: { email: victim.email, password: 'nope-nope' } })).status, 401);

    await request('PATCH', `/platform/users/${victim.user.id}/active`, { token: admin.token, body: { active: true } });
    assert.equal((await request('GET', '/questions', { token: victim.token })).status, 200);
  });

  it('protects admins from locking themselves out', async () => {
    const admin = await createAdmin();
    const self = await request('PATCH', `/platform/users/${admin.id}/active`, { token: admin.token, body: { active: false } });
    assert.equal(self.status, 400);
    const role = await request('PATCH', `/platform/users/${admin.id}/role`, { token: admin.token, body: { role: 'business' } });
    assert.equal(role.status, 400);
  });

  it('promotes and demotes users with immediate effect, rejecting bad input', async () => {
    const admin = await createAdmin();
    const user = await register();
    assert.equal((await request('GET', '/platform/stats', { token: user.token })).status, 403);

    assert.equal((await request('PATCH', `/platform/users/${user.user.id}/role`, { token: admin.token, body: { role: 'superuser' } })).status, 400);
    assert.equal((await request('PATCH', `/platform/users/${user.user.id}/role`, { token: admin.token, body: { role: 'business' } })).status, 400, 'no-op change');

    assert.equal((await request('PATCH', `/platform/users/${user.user.id}/role`, { token: admin.token, body: { role: 'admin' } })).status, 200);
    assert.equal((await request('GET', '/platform/stats', { token: user.token })).status, 200);

    await request('PATCH', `/platform/users/${user.user.id}/role`, { token: admin.token, body: { role: 'advisor' } });
    assert.equal((await request('GET', '/platform/stats', { token: user.token })).status, 403);
    const [row] = await app.db.query('SELECT advisor_code FROM users WHERE id = :id', { id: user.user.id });
    assert.ok(row.advisor_code, 'a newly-advisor account gets an invite code');
  });

  it('edits question wording, which businesses then see, and validates input', async () => {
    const admin = await createAdmin();
    const business = await register({ sector: 'technology' });
    const before = await questionsFor(business.token);

    const list = await request('GET', '/platform/questions?sector=technology', { token: admin.token });
    assert.equal(list.body.questions.length, 15);
    const target = list.body.questions.find((q) => q.id === before[0].id);

    const edit = await request('PATCH', `/platform/questions/${target.id}`, { token: admin.token, body: { text: 'Edited wording?' } });
    assert.equal(edit.status, 200);
    assert.equal((await questionsFor(business.token))[0].text, 'Edited wording?');

    assert.equal((await request('PATCH', `/platform/questions/${target.id}`, { token: admin.token, body: { text: '' } })).status, 400);
    assert.equal((await request('PATCH', '/platform/questions/999999', { token: admin.token, body: { text: 'x' } })).status, 404);
  });
});
