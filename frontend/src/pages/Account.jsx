import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, UserCheck, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

const inputClass =
  'w-full rounded-xl border border-border bg-ink px-3 py-2.5 text-sm text-text outline-none focus:border-amber';
const labelClass = 'mb-1.5 block text-xs font-mono uppercase tracking-wide text-muted';
const errorBox = 'rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300';

function ChangePassword() {
  const { changePassword } = useAuth();
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

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-surface p-6">
      <h2 className="font-display text-lg font-semibold">Change password</h2>

      {error && <div className={errorBox}>{error}</div>}
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
  );
}

// Businesses can join (or leave) an advisor after registering.
function AdvisorLink() {
  const { updateUser } = useAuth();
  const [advisor, setAdvisor] = useState(undefined); // undefined = loading, null = none
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .get('/auth/advisor')
      .then(({ data }) => {
        if (!cancelled) setAdvisor(data.advisor);
      })
      .catch(() => {
        if (!cancelled) setAdvisor(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const link = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/auth/advisor', { advisor_code: code });
      updateUser(data.user);
      setAdvisor(data.advisor);
      setCode('');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not link that advisor');
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    if (!window.confirm('Unlink from your advisor? They will no longer be able to see your assessments, roadmaps or notes.')) return;
    setBusy(true);
    setError('');
    try {
      const { data } = await api.delete('/auth/advisor');
      updateUser(data.user);
      setAdvisor(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not unlink');
    } finally {
      setBusy(false);
    }
  };

  if (advisor === undefined) return null;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-6">
      <h2 className="flex items-center gap-1.5 font-display text-lg font-semibold">
        <UserCheck size={16} className="text-teal" /> Your advisor
      </h2>
      {error && <div className={errorBox}>{error}</div>}

      {advisor ? (
        <>
          <p className="text-sm text-muted">
            You&apos;re linked to <span className="text-text">{advisor.name}</span>. They can see your assessments,
            roadmaps, website checks and the notes they write.
          </p>
          <button
            type="button"
            onClick={unlink}
            disabled={busy}
            className="rounded-xl border border-border px-4 py-2 text-sm text-muted transition hover:border-red-500/40 hover:text-red-300 disabled:opacity-60"
          >
            Unlink advisor
          </button>
        </>
      ) : (
        <form onSubmit={link} className="space-y-3">
          <p className="text-sm text-muted">
            Working with an advisor? Enter the code they gave you to let them see your results. No advisor can see your
            data until you do this.
          </p>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Advisor code"
              maxLength={20}
              className={`${inputClass} uppercase`}
            />
            <button
              type="submit"
              disabled={busy || !code.trim()}
              className="shrink-0 rounded-xl bg-amber px-4 py-2 text-sm font-semibold text-ink transition hover:bg-amber/90 disabled:opacity-60"
            >
              Link
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function DeleteAccount() {
  const { user, deleteAccount, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!window.confirm('Delete your account permanently? This cannot be undone.')) return;
    setBusy(true);
    setError('');
    try {
      await deleteAccount(password);
      navigate('/', { replace: true });
      logout();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete the account');
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-red-500/30 bg-surface p-6">
      <h2 className="flex items-center gap-1.5 font-display text-lg font-semibold">
        <Trash2 size={16} className="text-red-300" /> Delete account
      </h2>
      <p className="text-sm text-muted">
        This permanently deletes your account
        {user?.role === 'business' && ', assessments, roadmaps, website checks and any notes about you'}
        {user?.role === 'advisor' && ', your notes, and unlinks your clients (their accounts stay)'}. It can&apos;t be
        undone.
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-xl border border-red-500/40 px-4 py-2 text-sm text-red-300 transition hover:bg-red-500/10"
        >
          I want to delete my account
        </button>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          {error && <div className={errorBox}>{error}</div>}
          <label className="block">
            <span className={labelClass}>Enter your password to confirm</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || !password}
              className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500/90 disabled:opacity-60"
            >
              {busy ? 'Deleting…' : 'Delete my account'}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setPassword('');
                setError('');
              }}
              className="rounded-xl border border-border px-4 py-2 text-sm text-muted transition hover:text-text"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function Account() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-12">
      <div>
        <h1 className="mb-1 font-display text-3xl font-bold">Your account</h1>
        <p className="text-sm text-muted">
          {user?.name} · {user?.email} · <span className="capitalize">{user?.role}</span>
        </p>
      </div>

      <ChangePassword />
      {user?.role === 'business' && <AdvisorLink />}
      <DeleteAccount />
    </div>
  );
}
