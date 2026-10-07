import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import api from '../api/client';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [linkProblem, setLinkProblem] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLinkProblem(false);
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, new_password: password });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not reset the password');
      setLinkProblem(err.response?.status === 400 && /link/i.test(err.response?.data?.message || ''));
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-border bg-ink px-3 py-2.5 text-sm text-text outline-none focus:border-amber';
  const labelClass = 'mb-1.5 block text-xs font-mono uppercase tracking-wide text-muted';

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
      <h1 className="mb-2 font-display text-3xl font-bold">Choose a new password</h1>
      <p className="mb-8 text-sm text-muted">This link works once. Other devices will be logged out.</p>

      {done ? (
        <div className="space-y-4 rounded-xl border border-teal/30 bg-teal/10 p-6 text-sm">
          <p className="flex items-center gap-2 text-teal">
            <Check size={16} /> Password updated.
          </p>
          <Link
            to="/login"
            className="inline-block rounded-xl bg-amber px-4 py-2 text-sm font-semibold text-ink transition hover:bg-amber/90"
          >
            Log in
          </Link>
        </div>
      ) : !token ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">
          This page needs a reset link.{' '}
          <Link to="/forgot-password" className="text-teal hover:underline">
            Request one
          </Link>
          .
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-surface p-6">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
              {linkProblem && (
                <>
                  {' '}
                  <Link to="/forgot-password" className="underline">
                    Request a new link
                  </Link>
                </>
              )}
            </div>
          )}
          <label className="block">
            <span className={labelClass}>New password</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
            <span className="mt-1 block text-xs text-muted">At least 8 characters.</span>
          </label>
          <label className="block">
            <span className={labelClass}>Confirm new password</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputClass}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-amber py-2.5 text-sm font-semibold text-ink transition hover:bg-amber/90 disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Set new password'}
          </button>
        </form>
      )}
    </div>
  );
}
