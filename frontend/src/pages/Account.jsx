import { useState } from 'react';
import { Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Account() {
  const { user, changePassword } = useAuth();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const update = (key) => (e) => {
    setDone(false);
    setForm((f) => ({ ...f, [key]: e.target.value }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setDone(false);
    if (form.next !== form.confirm) {
      setError('The new passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await changePassword(form.current, form.next);
      setForm({ current: '', next: '', confirm: '' });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not change the password');
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-border bg-ink px-3 py-2.5 text-sm text-text outline-none focus:border-amber';
  const labelClass = 'mb-1.5 block text-xs font-mono uppercase tracking-wide text-muted';

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-1 font-display text-3xl font-bold">Your account</h1>
      <p className="mb-8 text-sm text-muted">
        {user?.name} · {user?.email} · <span className="capitalize">{user?.role}</span>
      </p>

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-surface p-6">
        <h2 className="font-display text-lg font-semibold">Change password</h2>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}
        {done && (
          <div className="flex items-center gap-2 rounded-lg border border-teal/30 bg-teal/10 px-3 py-2 text-sm text-teal">
            <Check size={14} /> Password changed. Any other devices have been logged out.
          </div>
        )}

        <label className="block">
          <span className={labelClass}>Current password</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={form.current}
            onChange={update('current')}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>New password</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={form.next}
            onChange={update('next')}
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
            value={form.confirm}
            onChange={update('confirm')}
            className={inputClass}
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-amber py-2.5 text-sm font-semibold text-ink transition hover:bg-amber/90 disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </div>
  );
}
