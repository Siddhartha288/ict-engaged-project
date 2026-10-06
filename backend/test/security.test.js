const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const { startApp, uniqueEmail } = require('./helpers');

let app;
let request;

const PASSWORD = 'TestPass123';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function register(overrides = {}) {
  const email = overrides.email || uniqueEmail('biz');
  const res = await request('POST', '/auth/register', {
    body: { name: 'Test User', email, password: PASSWORD, role: 'business', business_name: 'Test Co', sector: 'retail', ...overrides },
  });
  assert.equal(res.status, 201, `register failed: ${JSON.stringify(res.body)}`);
  return { token: res.body.token, user: res.body.user, email };
}

async function createAdmin() {
  const email = uniqueEmail('admin');
  const hash = await bcrypt.hash(PASSWORD, 4);
  await app.db.query("INSERT INTO users (name, email, password_hash, role) VALUES ('Admin', :email, :hash, 'admin')", { email, hash });
  const login = await request('POST', '/auth/login', { body: { email, password: PASSWORD } });
  return { token: login.body.token, email };
}

const events = (email) => app.db.query('SELECT * FROM audit_log WHERE actor_email = :email ORDER BY id', { email });

before(async () => {
  app = await startApp();
  request = app.request;
});

after(async () => {
  await app.stop();
});

describe('password rules', () => {
  it('requires at least 8 characters when registering', async () => {
    const res = await request('POST', '/auth/register', {
      body: { name: 'X', email: uniqueEmail('short'), password: 'abc1234', role: 'business', sector: 'retail' },
    });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /8 characters/);
  });
});

describe('login rate limiting and failed-login logging', () => {
  it('logs failed logins without ever recording the password', async () => {
    const { email } = await register();
    await request('POST', '/auth/login', { body: { email, password: 'SuperSecretGuess1' } });
    await request('POST', '/auth/login', { body: { email: 'nobody@test.local', password: 'whatever12' } });

    const mine = await events(email);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].event_type, 'login_failed');
    assert.equal(mine[0].detail, 'wrong password');
    assert.ok(mine[0].ip);
    assert.ok(!JSON.stringify(mine).includes('SuperSecretGuess1'));

    const unknown = await events('nobody@test.local');
    assert.equal(unknown[0].detail, 'unknown account');
  });

  it('locks an account after repeated failures, even for the right password, without affecting others', async () => {
    const victim = await register();
    const bystander = await register();

    for (let i = 0; i < 8; i += 1) {
      const res = await request('POST', '/auth/login', { body: { email: victim.email, password: `wrong-guess-${i}` } });
      assert.equal(res.status, 401);
    }
    const blocked = await request('POST', '/auth/login', { body: { email: victim.email, password: PASSWORD } });
    assert.equal(blocked.status, 429);
    assert.match(blocked.body.message, /Too many failed attempts/);

    const types = (await events(victim.email)).map((e) => e.event_type);
    assert.ok(types.includes('login_blocked'));

    // Someone else logging in from the same IP is unaffected.
    assert.equal((await request('POST', '/auth/login', { body: { email: bystander.email, password: PASSWORD } })).status, 200);
  });

  it('resets the per-account counter after a successful login', async () => {
    const user = await register();
    for (let i = 0; i < 5; i += 1) await request('POST', '/auth/login', { body: { email: user.email, password: `bad-guess-${i}` } });
    assert.equal((await request('POST', '/auth/login', { body: { email: user.email, password: PASSWORD } })).status, 200);
    // Five more would have tripped the limit (8) had the counter not been reset.
    for (let i = 0; i < 5; i += 1) await request('POST', '/auth/login', { body: { email: user.email, password: `bad-guess-${i}` } });
    assert.equal((await request('POST', '/auth/login', { body: { email: user.email, password: PASSWORD } })).status, 200);
  });
});

describe('change password', () => {
  it('validates input and requires the current password', async () => {
    const { token, email } = await register();
    const call = (body) => request('POST', '/auth/change-password', { token, body });

    assert.equal((await request('POST', '/auth/change-password', { body: {} })).status, 401);
    assert.equal((await call({ new_password: 'BrandNewPass1' })).status, 400);
    assert.equal((await call({ current_password: PASSWORD, new_password: 'short' })).status, 400);
    assert.equal((await call({ current_password: PASSWORD, new_password: PASSWORD })).status, 400);

    const wrong = await call({ current_password: 'not-my-password', new_password: 'BrandNewPass1' });
    assert.equal(wrong.status, 400);
    assert.match(wrong.body.message, /incorrect/);
    assert.ok((await events(email)).some((e) => e.event_type === 'password_change_failed'));
  });

  it('changes the password, issues a fresh token, and ends older sessions', async () => {
    const { token: oldToken, email } = await register();
    // Token timestamps and the stored change time have one-second resolution.
    await sleep(1100);

    const res = await request('POST', '/auth/change-password', {
      token: oldToken,
      body: { current_password: PASSWORD, new_password: 'BrandNewPass1' },
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal(res.body.user.email, email);

    assert.equal((await request('GET', '/questions', { token: res.body.token })).status, 200, 'fresh token works');
    const stale = await request('GET', '/questions', { token: oldToken });
    assert.equal(stale.status, 401, 'old token is rejected');
    assert.match(stale.body.message, /expired/);

    assert.equal((await request('POST', '/auth/login', { body: { email, password: PASSWORD } })).status, 401);
    assert.equal((await request('POST', '/auth/login', { body: { email, password: 'BrandNewPass1' } })).status, 200);
    assert.ok((await events(email)).some((e) => e.event_type === 'password_changed'));
  });
});

describe('activity log (admin)', () => {
  it('is admin-only and lists security and admin events, filterable by type', async () => {
    const admin = await createAdmin();
    const user = await register();
    await request('POST', '/auth/login', { body: { email: user.email, password: 'wrong-wrong-1' } });
    await request('PATCH', `/platform/users/${user.user.id}/role`, { token: admin.token, body: { role: 'advisor' } });

    assert.equal((await request('GET', '/platform/activity', { token: user.token })).status, 403);
    assert.equal((await request('GET', '/platform/activity')).status, 401);

    const all = await request('GET', '/platform/activity', { token: admin.token });
    assert.equal(all.status, 200);
    assert.ok(all.body.types.includes('login_failed'));
    assert.ok(all.body.types.includes('role_changed'));
    const roleEvent = all.body.events.find((e) => e.event_type === 'role_changed');
    assert.equal(roleEvent.actor_email, admin.email);
    assert.equal(roleEvent.target_user_id, user.user.id);

    const only = await request('GET', '/platform/activity?type=role_changed', { token: admin.token });
    assert.ok(only.body.events.length >= 1);
    assert.ok(only.body.events.every((e) => e.event_type === 'role_changed'));
  });
});
