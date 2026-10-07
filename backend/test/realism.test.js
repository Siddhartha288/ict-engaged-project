const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const { startApp, uniqueEmail } = require('./helpers');
const { loginGuard } = require('../middleware/rateLimit');
const { sha256 } = require('../services/tokens');

let app;
let request;

const PASSWORD = 'TestPass123';
const DAY = 24 * 60 * 60 * 1000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function register(overrides = {}) {
  const email = overrides.email || uniqueEmail('biz');
  const res = await request('POST', '/auth/register', {
    body: { name: 'Test User', email, password: PASSWORD, role: 'business', business_name: 'Test Co', sector: 'retail', ...overrides },
  });
  assert.equal(res.status, 201, `register failed: ${JSON.stringify(res.body)}`);
  return { token: res.body.token, user: res.body.user, email };
}

const registerAdvisor = () => register({ role: 'advisor', sector: undefined, business_name: undefined });

async function createAdmin() {
  const email = uniqueEmail('admin');
  const hash = await bcrypt.hash(PASSWORD, 4);
  const result = await app.db.query("INSERT INTO users (name, email, password_hash, role) VALUES ('Admin', :email, :hash, 'admin')", { email, hash });
  const login = await request('POST', '/auth/login', { body: { email, password: PASSWORD } });
  return { token: login.body.token, id: result.insertId, email };
}

async function submitAssessment(token, answer = () => 0) {
  const qs = await request('GET', '/questions', { token });
  const questions = qs.body.categories.flatMap((c) => c.questions);
  return request('POST', '/assessments', { token, body: { responses: questions.map((q, i) => ({ question_id: q.id, answer: answer(i) })) } });
}

const tokenFromLink = (link) => new URL(link).searchParams.get('token');

before(async () => {
  app = await startApp();
  request = app.request;
});

after(async () => {
  await app.stop();
});

describe('advisors only see their own clients', () => {
  it('hides another advisor’s client everywhere', async () => {
    const owner = await registerAdvisor();
    const other = await registerAdvisor();
    const client = await register({ advisor_code: owner.user.advisor_code });
    const assessment = await submitAssessment(client.token);
    await request('POST', `/assessments/${assessment.body.id}/roadmap`, { token: client.token, body: {} });
    const id = client.user.id;

    // The owner can see everything.
    assert.equal((await request('GET', `/admin/businesses/${id}`, { token: owner.token })).status, 200);
    assert.equal((await request('GET', `/assessments/${assessment.body.id}`, { token: owner.token })).status, 200);
    assert.equal((await request('GET', `/assessments/${assessment.body.id}/roadmap`, { token: owner.token })).status, 200);

    // The other advisor can see none of it.
    const attempts = [
      ['GET', `/admin/businesses/${id}`, 404],
      ['GET', `/admin/businesses/${id}/questions`, 404],
      ['POST', `/admin/businesses/${id}/assessments`, 404],
      ['PATCH', `/admin/businesses/${id}/status`, 404, { status: 'on_track' }],
      ['GET', `/assessments/${assessment.body.id}`, 403],
      ['GET', `/assessments/${assessment.body.id}/benchmark`, 403],
      ['GET', `/assessments/${assessment.body.id}/roadmap`, 403],
      ['PATCH', `/assessments/${assessment.body.id}/roadmap/actions/0`, 403, { completed: true }],
      ['GET', `/notes/${id}`, 403],
      ['POST', `/notes/${id}`, 404, { content: 'hello' }],
    ];
    for (const [method, url, expected, body] of attempts) {
      const res = await request(method, url, { token: other.token, body });
      assert.equal(res.status, expected, `${method} ${url}`);
    }
    const list = await request('GET', '/admin/businesses', { token: other.token });
    assert.equal(list.body.businesses.length, 0);
    const impact = await request('GET', '/admin/impact', { token: other.token });
    assert.equal(impact.body.caseload_size, 0);
  });
});

describe('linking to an advisor after registering', () => {
  it('lets a business add and remove an advisor code, with immediate effect on access', async () => {
    const advisor = await registerAdvisor();
    const biz = await register(); // registered without a code
    const assessment = await submitAssessment(biz.token);

    assert.equal((await request('GET', `/assessments/${assessment.body.id}`, { token: advisor.token })).status, 403);
    assert.equal((await request('GET', '/auth/advisor', { token: biz.token })).body.advisor, null);

    assert.equal((await request('POST', '/auth/advisor', { token: biz.token, body: { advisor_code: 'ZZZZZZ' } })).status, 400, 'unknown code');
    assert.equal((await request('POST', '/auth/advisor', { token: biz.token, body: {} })).status, 400);

    const linked = await request('POST', '/auth/advisor', { token: biz.token, body: { advisor_code: advisor.user.advisor_code.toLowerCase() } });
    assert.equal(linked.status, 200);
    assert.equal(linked.body.user.advisor_id, advisor.user.id);
    assert.equal((await request('GET', '/auth/advisor', { token: biz.token })).body.advisor.name, 'Test User');
    assert.equal((await request('GET', `/assessments/${assessment.body.id}`, { token: advisor.token })).status, 200);
    assert.equal((await request('POST', '/auth/advisor', { token: biz.token, body: { advisor_code: advisor.user.advisor_code } })).status, 400, 'already linked');

    const unlinked = await request('DELETE', '/auth/advisor', { token: biz.token });
    assert.equal(unlinked.status, 200);
    assert.equal(unlinked.body.user.advisor_id, null);
    assert.equal((await request('GET', `/assessments/${assessment.body.id}`, { token: advisor.token })).status, 403);

    // Advisors and admins have no advisor to link.
    assert.equal((await request('POST', '/auth/advisor', { token: advisor.token, body: { advisor_code: advisor.user.advisor_code } })).status, 403);
  });
});

describe('claim codes', () => {
  it('stores only a hash, can be reissued, and is guarded against guessing', async () => {
    const advisor = await registerAdvisor();
    const email = uniqueEmail('walkin');
    const created = await request('POST', '/admin/businesses', {
      token: advisor.token,
      body: { name: 'Walk In', email, business_name: 'Cafe', sector: 'hospitality' },
    });
    const code = created.body.claim_code;
    const [row] = await app.db.query('SELECT claim_code_hash FROM users WHERE email = :email', { email });
    assert.ok(row.claim_code_hash && !JSON.stringify(row).includes(code.replace('-', '')), 'only a hash is stored');

    // Another advisor can't reissue it; the owner can, and the old code stops working.
    const other = await registerAdvisor();
    assert.equal((await request('POST', `/admin/businesses/${created.body.id}/claim-code`, { token: other.token })).status, 404);
    const reissued = await request('POST', `/admin/businesses/${created.body.id}/claim-code`, { token: advisor.token });
    assert.equal(reissued.status, 200);
    assert.notEqual(reissued.body.claim_code, code);
    assert.equal((await request('POST', '/auth/claim', { body: { email, password: PASSWORD, claim_code: code } })).status, 400, 'old code is dead');

    // Guessing is throttled.
    loginGuard.clearAll();
    for (let i = 0; i < 8; i += 1) {
      assert.equal((await request('POST', '/auth/claim', { body: { email, password: PASSWORD, claim_code: `WRNG-000${i}` } })).status, 400);
    }
    const blocked = await request('POST', '/auth/claim', { body: { email, password: PASSWORD, claim_code: reissued.body.claim_code } });
    assert.equal(blocked.status, 429, 'even the right code is refused while locked');
    loginGuard.clearAll();

    // The right code works (accepting the lowercase, unhyphenated form too) and can't be reused.
    const ok = await request('POST', '/auth/claim', { body: { email, password: PASSWORD, claim_code: reissued.body.claim_code.replace('-', '').toLowerCase() } });
    assert.equal(ok.status, 200);
    assert.equal((await request('POST', `/admin/businesses/${created.body.id}/claim-code`, { token: advisor.token })).status, 400, 'already claimed');
  });
});

describe('forgotten passwords', () => {
  it('gives the same answer for any email, and records a token only for a real account', async () => {
    loginGuard.clearAll();
    const user = await register();
    const known = await request('POST', '/auth/forgot-password', { body: { email: user.email } });
    const unknown = await request('POST', '/auth/forgot-password', { body: { email: 'nobody@test.local' } });
    assert.equal(known.status, 200);
    assert.deepEqual(known.body, unknown.body, 'responses must not reveal whether the account exists');
    assert.equal(known.body.email_enabled, false, 'email is not configured in tests');

    const [{ n }] = await app.db.query('SELECT COUNT(*) AS n FROM password_resets WHERE user_id = :id', { id: user.user.id });
    assert.equal(Number(n), 1);
    const [{ m }] = await app.db.query("SELECT COUNT(*) AS m FROM audit_log WHERE actor_email = 'nobody@test.local' AND event_type = 'password_reset_requested'");
    assert.equal(Number(m), 1);

    // A second request cancels the first token.
    await request('POST', '/auth/forgot-password', { body: { email: user.email } });
    const rows = await app.db.query('SELECT used_at FROM password_resets WHERE user_id = :id ORDER BY id', { id: user.user.id });
    assert.ok(rows[0].used_at && !rows[1].used_at);
    assert.equal((await request('POST', '/auth/forgot-password', { body: {} })).status, 400);
  });

  it('lets an admin issue a one-time link that resets the password and ends old sessions', async () => {
    loginGuard.clearAll();
    const admin = await createAdmin();
    const user = await register();

    assert.equal((await request('POST', `/platform/users/${user.user.id}/reset-link`, { token: user.token })).status, 403);
    assert.equal((await request('POST', `/platform/users/${admin.id}/reset-link`, { token: admin.token })).status, 400, 'not for yourself');

    const issued = await request('POST', `/platform/users/${user.user.id}/reset-link`, { token: admin.token });
    assert.equal(issued.status, 200);
    const token = tokenFromLink(issued.body.link);
    const [stored] = await app.db.query('SELECT token_hash FROM password_resets WHERE user_id = :id ORDER BY id DESC LIMIT 1', { id: user.user.id });
    assert.equal(stored.token_hash, sha256(token));
    assert.notEqual(stored.token_hash, token, 'only the hash is stored');

    await sleep(1100); // sessions and the change time have one-second resolution
    assert.equal((await request('POST', '/auth/reset-password', { body: { token, new_password: 'short' } })).status, 400);
    assert.equal((await request('POST', '/auth/reset-password', { body: { token: 'f'.repeat(64), new_password: 'BrandNewPass1' } })).status, 400, 'unknown token');

    const reset = await request('POST', '/auth/reset-password', { body: { token, new_password: 'BrandNewPass1' } });
    assert.equal(reset.status, 200);
    assert.equal((await request('POST', '/auth/reset-password', { body: { token, new_password: 'AnotherPass22' } })).status, 400, 'single use');

    assert.equal((await request('GET', '/questions', { token: user.token })).status, 401, 'old session ended');
    assert.equal((await request('POST', '/auth/login', { body: { email: user.email, password: PASSWORD } })).status, 401);
    assert.equal((await request('POST', '/auth/login', { body: { email: user.email, password: 'BrandNewPass1' } })).status, 200);

    const types = (await request('GET', '/platform/activity', { token: admin.token })).body.types;
    assert.ok(types.includes('reset_link_issued') && types.includes('password_reset_completed'));
  });

  it('rejects an expired token, and lets a reset clear a login lockout', async () => {
    loginGuard.clearAll();
    const admin = await createAdmin();
    const user = await register();
    const issued = await request('POST', `/platform/users/${user.user.id}/reset-link`, { token: admin.token });
    const token = tokenFromLink(issued.body.link);

    await app.db.query('UPDATE password_resets SET expires_at = :past WHERE user_id = :id', { past: new Date(Date.now() - 1000), id: user.user.id });
    assert.equal((await request('POST', '/auth/reset-password', { body: { token, new_password: 'BrandNewPass1' } })).status, 400, 'expired');

    // Lock the account, then recover it with a fresh link.
    for (let i = 0; i < 8; i += 1) await request('POST', '/auth/login', { body: { email: user.email, password: `bad-guess-${i}` } });
    assert.equal((await request('POST', '/auth/login', { body: { email: user.email, password: PASSWORD } })).status, 429);
    const second = tokenFromLink((await request('POST', `/platform/users/${user.user.id}/reset-link`, { token: admin.token })).body.link);
    assert.equal((await request('POST', '/auth/reset-password', { body: { token: second, new_password: 'BrandNewPass1' } })).status, 200);
    assert.equal((await request('POST', '/auth/login', { body: { email: user.email, password: 'BrandNewPass1' } })).status, 200, 'lockout cleared');
  });

  it('refuses a reset link for an unclaimed or deactivated account', async () => {
    const admin = await createAdmin();
    const advisor = await registerAdvisor();
    const created = await request('POST', '/admin/businesses', { token: advisor.token, body: { name: 'W', email: uniqueEmail('w'), sector: 'retail' } });
    assert.equal((await request('POST', `/platform/users/${created.body.id}/reset-link`, { token: admin.token })).status, 400);
    const user = await register();
    await request('PATCH', `/platform/users/${user.user.id}/active`, { token: admin.token, body: { active: false } });
    assert.equal((await request('POST', `/platform/users/${user.user.id}/reset-link`, { token: admin.token })).status, 400);
  });
});

describe('reminders', () => {
  it('nudges a business to re-assess after 30 days and to finish a stale roadmap', async () => {
    const biz = await register();
    const none = await request('GET', '/reminders', { token: biz.token });
    assert.equal(none.body.reassess.never, true);
    assert.equal(none.body.reassess.due, false);

    const assessment = await submitAssessment(biz.token);
    await request('POST', `/assessments/${assessment.body.id}/roadmap`, { token: biz.token, body: {} });
    const fresh = await request('GET', '/reminders', { token: biz.token });
    assert.equal(fresh.body.reassess.due, false);
    assert.equal(fresh.body.actions, null);

    // A little over whole days, so rounding down to whole days is exact.
    const HOUR = 60 * 60 * 1000;
    await app.db.query('UPDATE assessments SET created_at = :d WHERE id = :id', { d: new Date(Date.now() - 40 * DAY - HOUR), id: assessment.body.id });
    await app.db.query('UPDATE roadmaps SET created_at = :d WHERE assessment_id = :id', { d: new Date(Date.now() - 20 * DAY - HOUR), id: assessment.body.id });
    const stale = await request('GET', '/reminders', { token: biz.token });
    assert.equal(stale.body.reassess.due, true);
    assert.equal(stale.body.reassess.days_since, 40);
    assert.ok(stale.body.actions.open_count >= 3);
    assert.equal(stale.body.actions.roadmap_age_days, 20);

    const advisor = await registerAdvisor();
    assert.equal((await request('GET', '/reminders', { token: advisor.token })).status, 403);
    assert.equal((await request('GET', '/reminders')).status, 401);
  });

  it('picks who to email: claimed, active, quiet, and not reminded recently', async () => {
    const { findDueEmailReminders } = require('../services/reminders');
    const quiet = await register();
    const recent = await register();
    const reminded = await register();
    const unclaimedAdvisor = await registerAdvisor();
    const unclaimed = await request('POST', '/admin/businesses', { token: unclaimedAdvisor.token, body: { name: 'U', email: uniqueEmail('u'), sector: 'retail' } });

    // quiet: assessed 45 days ago; recent: assessed yesterday; reminded: quiet but nudged 5 days ago.
    for (const [who, assessedDaysAgo] of [[quiet, 45], [recent, 1], [reminded, 45]]) {
      const a = await submitAssessment(who.token);
      await app.db.query('UPDATE assessments SET created_at = :d WHERE id = :id', { d: new Date(Date.now() - assessedDaysAgo * DAY), id: a.body.id });
    }
    await app.db.query('UPDATE users SET last_reminder_at = :d WHERE id = :id', { d: new Date(Date.now() - 5 * DAY), id: reminded.user.id });

    const due = (await findDueEmailReminders()).map((p) => p.id);
    assert.ok(due.includes(quiet.user.id));
    assert.ok(!due.includes(recent.user.id));
    assert.ok(!due.includes(reminded.user.id));
    assert.ok(!due.includes(unclaimed.body.id), 'unclaimed accounts can’t log in, so aren’t emailed');
  });
});

describe('shared reports', () => {
  it('shares a read-only report without exposing owner details or money figures, and can be revoked', async () => {
    const biz = await register({ business_name: 'Sharable Bakery', name: 'Private Owner' });
    assert.equal((await request('POST', '/share', { token: biz.token, body: {} })).status, 400, 'needs an assessment first');
    const assessment = await submitAssessment(biz.token, (i) => (i % 2));
    await request('POST', `/assessments/${assessment.body.id}/roadmap`, { token: biz.token, body: {} });
    await request('PATCH', `/assessments/${assessment.body.id}/roadmap/actions/0`, { token: biz.token, body: { cost: 1234, expected_benefit: 5678 } });

    const made = await request('POST', '/share', { token: biz.token, body: {} });
    assert.equal(made.status, 201);
    const token = tokenFromLink(made.body.link.replace('/shared/', '/x?token='));
    const [stored] = await app.db.query('SELECT token_hash FROM report_shares WHERE id = :id', { id: made.body.id });
    assert.equal(stored.token_hash, sha256(token));

    // Public, no login.
    const shared = await request('GET', `/shared/${token}`);
    assert.equal(shared.status, 200);
    assert.equal(shared.body.business_name, 'Sharable Bakery');
    assert.equal(shared.body.total_score, assessment.body.total_score);
    assert.equal(shared.body.categories.length, 5);
    assert.ok(shared.body.roadmap.actions.length >= 3);
    const text = JSON.stringify(shared.body);
    for (const secret of [biz.email, 'Private Owner', '1234', '5678', 'cost', 'expected_benefit']) {
      assert.ok(!text.includes(secret), `shared report must not include ${secret}`);
    }

    const listed = await request('GET', '/share', { token: biz.token });
    assert.equal(listed.body.shares.length, 1);
    assert.equal((await request('DELETE', `/share/${made.body.id}`, { token: biz.token })).status, 200);
    assert.equal((await request('GET', `/shared/${token}`)).status, 404, 'revoked');
  });

  it('expires links, rejects bad tokens, and limits who can create them', async () => {
    loginGuard.clearAll();
    const advisor = await registerAdvisor();
    const other = await registerAdvisor();
    const client = await register({ advisor_code: advisor.user.advisor_code });
    await submitAssessment(client.token);

    assert.equal((await request('POST', '/share', { body: {} })).status, 401);
    assert.equal((await request('POST', '/share', { token: other.token, body: { business_id: client.user.id } })).status, 404, 'not their client');
    const byAdvisor = await request('POST', '/share', { token: advisor.token, body: { business_id: client.user.id } });
    assert.equal(byAdvisor.status, 201);

    const token = byAdvisor.body.link.split('/shared/')[1];
    assert.equal((await request('GET', `/shared/${token}`)).status, 200);
    await app.db.query('UPDATE report_shares SET expires_at = :past WHERE id = :id', { past: new Date(Date.now() - 1000), id: byAdvisor.body.id });
    assert.equal((await request('GET', `/shared/${token}`)).status, 404, 'expired');
    assert.equal((await request('GET', '/shared/not-a-real-token')).status, 404);

    // At most five live links per business.
    for (let i = 0; i < 5; i += 1) assert.equal((await request('POST', '/share', { token: client.token, body: {} })).status, 201);
    assert.equal((await request('POST', '/share', { token: client.token, body: {} })).status, 400);
    // Another business can't revoke someone else's link.
    const stranger = await register();
    const mine = (await request('GET', '/share', { token: client.token })).body.shares[0];
    assert.equal((await request('DELETE', `/share/${mine.id}`, { token: stranger.token })).status, 404);
  });
});

describe('deleting your own account', () => {
  it('needs the password, removes the data, and leaves an audit trail', async () => {
    loginGuard.clearAll();
    const biz = await register();
    const assessment = await submitAssessment(biz.token);

    assert.equal((await request('DELETE', '/auth/account', { token: biz.token, body: {} })).status, 400);
    assert.equal((await request('DELETE', '/auth/account', { token: biz.token, body: { password: 'wrong-password' } })).status, 400);
    assert.equal((await request('DELETE', '/auth/account', { token: biz.token, body: { password: PASSWORD } })).status, 200);

    assert.equal((await request('POST', '/auth/login', { body: { email: biz.email, password: PASSWORD } })).status, 401);
    const [{ n }] = await app.db.query('SELECT COUNT(*) AS n FROM assessments WHERE id = :id', { id: assessment.body.id });
    assert.equal(Number(n), 0, 'assessments are deleted with the account');
    const [log] = await app.db.query("SELECT event_type FROM audit_log WHERE actor_email = :e AND event_type = 'account_deleted'", { e: biz.email });
    assert.ok(log, 'the deletion is logged');
  });

  it('unlinks an advisor’s clients rather than deleting them, and protects the last admin', async () => {
    loginGuard.clearAll();
    const advisor = await registerAdvisor();
    const client = await register({ advisor_code: advisor.user.advisor_code });
    assert.equal((await request('DELETE', '/auth/account', { token: advisor.token, body: { password: PASSWORD } })).status, 200);
    const [row] = await app.db.query('SELECT advisor_id FROM users WHERE id = :id', { id: client.user.id });
    assert.equal(row.advisor_id, null);

    // Make sure exactly one admin exists, then try to delete it.
    await app.db.query("DELETE FROM users WHERE role = 'admin'");
    const admin = await createAdmin();
    assert.equal((await request('DELETE', '/auth/account', { token: admin.token, body: { password: PASSWORD } })).status, 400);
    const second = await createAdmin();
    assert.equal((await request('DELETE', '/auth/account', { token: second.token, body: { password: PASSWORD } })).status, 200);
  });
});

describe('website audit signals', () => {
  it('detects a contact method and a privacy/terms link from the page HTML', () => {
    const { analyzeHtml } = require('../services/websiteAudit');
    const full = analyzeHtml('<a href="tel:+61400000000">Call</a><a href="/privacy-policy">Privacy</a>');
    assert.equal(full.contact_detected, true);
    assert.equal(full.policy_detected, true);
    const mail = analyzeHtml('<a href="mailto:hi@shop.test">Email</a>');
    assert.equal(mail.contact_detected, true);
    assert.equal(mail.policy_detected, false);
    const bare = analyzeHtml('<html><title>Shop</title><body>Welcome</body></html>');
    assert.equal(bare.contact_detected, false);
    assert.equal(bare.policy_detected, false);
  });
});
