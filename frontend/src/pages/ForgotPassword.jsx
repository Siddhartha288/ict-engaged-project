import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/auth/forgot-password', { email });
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
      <h1 className="mb-2 font-display text-3xl font-bold">Forgot your password?</h1>
      <p className="mb-8 text-sm text-muted">Enter your email and we&apos;ll send you a link to choose a new one.</p>

      {result ? (
        <div className="space-y-3 rounded-xl border border-border bg-surface p-6 text-sm">
          <p className="text-text">{result.message}</p>
          {result.email_enabled ? (
            <p className="text-muted">Check your inbox (and spam folder). The link works once and expires in an hour.</p>
          ) : (
            <p className="text-muted">
              Email isn&apos;t set up on this server yet, so nothing was sent. Ask an administrator to send you a reset
              link — they can create one in a few seconds.
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-surface p-6">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>
          )}
          <label className="block">
            <span className="mb-1.5 block text-xs font-mono uppercase tracking-wide text-muted">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-border bg-ink px-3 py-2.5 text-sm text-text outline-none focus:border-amber"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-amber py-2.5 text-sm font-semibold text-ink transition hover:bg-amber/90 disabled:opacity-60"
          >
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-muted">
        <Link to="/login" className="text-teal hover:underline">
          Back to log in
        </Link>
      </p>
    </div>
  );
}
