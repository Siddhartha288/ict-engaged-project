const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeUrl, runWebsiteAudit } = require('../services/websiteAudit');

describe('normalizeUrl', () => {
  it('adds https:// to a bare domain', () => {
    assert.equal(normalizeUrl('example.com').toString(), 'https://example.com/');
  });

  it('keeps an explicit http(s) URL', () => {
    assert.equal(normalizeUrl('http://example.com/a').protocol, 'http:');
    assert.equal(normalizeUrl('https://example.com/a?b=1').search, '?b=1');
  });

  it('rejects empty input', () => {
    assert.throws(() => normalizeUrl(''), /required/i);
    assert.throws(() => normalizeUrl('   '), /required/i);
  });

  it('rejects non-http(s) schemes instead of mangling them', () => {
    for (const bad of ['ftp://example.com', 'javascript://alert(1)', 'file:///etc/passwd']) {
      assert.throws(() => normalizeUrl(bad), /only http and https/i, bad);
    }
  });
});

describe('SSRF protection (no network needed)', () => {
  const blocked = [
    ['localhost', 'http://localhost:3013/api/health'],
    ['loopback', 'http://127.0.0.1/'],
    ['private 10.x', 'http://10.0.0.5/'],
    ['private 172.16.x', 'http://172.16.0.1/'],
    ['private 192.168.x', 'http://192.168.1.1/'],
    ['cloud metadata', 'http://169.254.169.254/latest/meta-data/'],
    ['unspecified', 'http://0.0.0.0/'],
  ];

  for (const [label, url] of blocked) {
    it(`refuses ${label}`, async () => {
      const result = await runWebsiteAudit(normalizeUrl(url));
      assert.equal(result.status, 'unreachable');
      assert.match(result.error_message, /private|internal|not allowed/i);
    });
  }

  it('reports an unresolvable domain as unreachable rather than throwing', async () => {
    const result = await runWebsiteAudit(normalizeUrl('https://this-domain-does-not-exist-xyz123.invalid'));
    assert.equal(result.status, 'unreachable');
  });
});
