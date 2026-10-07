const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { sendEmail, emailConfigured, appBase } = require('../services/email');

const ENV_KEYS = ['RESEND_API_KEY', 'EMAIL_FROM', 'APP_URL'];
const realFetch = global.fetch;
let saved;

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

describe('email service', () => {
  it('does nothing, without any network call, when not configured', async () => {
    global.fetch = async () => assert.fail('must not call the network');
    assert.equal(emailConfigured(), false);
    const result = await sendEmail({ to: 'a@test.local', subject: 's', text: 't' });
    assert.equal(result.sent, false);
    assert.match(result.reason, /not configured/);
  });

  it('treats placeholder keys and a missing sender as not configured', () => {
    process.env.RESEND_API_KEY = 'your_resend_key';
    process.env.EMAIL_FROM = 'BizTransform <noreply@example.com>';
    assert.equal(emailConfigured(), false);
    process.env.RESEND_API_KEY = 're_real_key';
    delete process.env.EMAIL_FROM;
    assert.equal(emailConfigured(), false);
  });

  it('sends through Resend with the key in a header and reports success or failure', async () => {
    process.env.RESEND_API_KEY = 're_secret_key';
    process.env.EMAIL_FROM = 'BizTransform <noreply@example.com>';
    let call;
    global.fetch = async (url, options) => {
      call = { url: String(url), options };
      return new Response('{}', { status: 200 });
    };
    const ok = await sendEmail({ to: 'a@test.local', subject: 'Hello', text: 'Body' });
    assert.equal(ok.sent, true);
    assert.equal(call.url, 'https://api.resend.com/emails');
    assert.equal(call.options.headers.authorization, 'Bearer re_secret_key');
    assert.deepEqual(JSON.parse(call.options.body), {
      from: 'BizTransform <noreply@example.com>',
      to: ['a@test.local'],
      subject: 'Hello',
      text: 'Body',
    });

    global.fetch = async () => new Response('{}', { status: 422 });
    assert.deepEqual(await sendEmail({ to: 'a@test.local', subject: 's', text: 't' }), {
      sent: false,
      reason: 'email provider returned HTTP 422',
    });

    global.fetch = async () => {
      throw new Error('network down');
    };
    assert.equal((await sendEmail({ to: 'a@test.local', subject: 's', text: 't' })).sent, false);
  });

  it('builds link bases from APP_URL, then the request origin, then the host', () => {
    const req = (headers, host = 'example.test:5000') => ({ get: (h) => (h === 'origin' ? headers.origin : host), protocol: 'https' });
    assert.equal(appBase(req({ origin: 'https://app.test' })), 'https://app.test');
    assert.equal(appBase(req({})), 'https://example.test:5000');
    process.env.APP_URL = 'https://configured.test/';
    assert.equal(appBase(req({ origin: 'https://app.test' })), 'https://configured.test');
  });
});
