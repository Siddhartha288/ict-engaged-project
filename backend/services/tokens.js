/**
 * Random secrets and their hashes. Reset tokens, share tokens and claim codes
 * are only ever stored as SHA-256 hashes, so a database leak doesn't hand out
 * working links or codes.
 */
const crypto = require('crypto');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

// 256 bits of randomness, URL-safe.
const newToken = () => crypto.randomBytes(32).toString('hex');

// e.g. "K7M2-9QXA": easy for an advisor to read out or write down.
function newClaimCode() {
  let code = '';
  for (let i = 0; i < 8; i += 1) code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

const normalizeClaimCode = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const hashClaimCode = (value) => sha256(normalizeClaimCode(value));

module.exports = { sha256, newToken, newClaimCode, hashClaimCode, normalizeClaimCode };
