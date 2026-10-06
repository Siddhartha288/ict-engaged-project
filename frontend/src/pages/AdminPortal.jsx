import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Users, ListChecks, Search, Save, Check } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

const TABS = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'questions', label: 'Questions', icon: ListChecks },
];

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-ink/50 px-3 py-3 text-center">
      <p className="font-mono text-2xl text-text">{value ?? '—'}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
    </div>
  );
}

function Overview() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/platform/stats');
        if (!cancelled) setStats(data);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || 'Failed to load stats');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="text-sm text-red-300">{error}</p>;
  if (!stats) return <p className="font-mono text-sm text-muted">Loading…</p>;

  const maxSector = Math.max(1, ...stats.businesses_by_sector.map((s) => s.businesses));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Businesses" value={stats.users_by_role.business} />
        <Stat label="Advisors" value={stats.users_by_role.advisor} />
        <Stat label="Admins" value={stats.users_by_role.admin} />
        <Stat label="New (7 days)" value={stats.new_users_7d} />
        <Stat label="Assessments" value={stats.assessments} />
        <Stat label="Avg score" value={stats.average_score != null ? `${stats.average_score}%` : null} />
        <Stat label="Website audits" value={stats.website_audits} />
        <Stat label="Deactivated" value={stats.inactive_users} />
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h3 className="mb-4 font-display text-lg font-semibold">Businesses by sector</h3>
        <div className="space-y-2">
          {stats.businesses_by_sector.map((s) => (
            <div key={s.label}>
              <div className="mb-1 flex justify-between text-xs text-muted">
                <span>{s.label}</span>
                <span className="font-mono">{s.businesses}</span>
              </div>
              <div className="h-1.5 rounded-full bg-ink/60">
                <div
                  className="h-1.5 rounded-full bg-teal"
                  style={{ width: `${(s.businesses / maxSector) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UsersTab() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/platform/users', { params: { search, role } });
      setUsers(data.users || []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load users');
    }
  }, [search, role]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const toggleActive = async (u) => {
    setBusyId(u.id);
    setError('');
    try {
      await api.patch(`/platform/users/${u.id}/active`, { active: !u.is_active });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, is_active: !u.is_active } : x)));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update user');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, or business…"
            className="w-72 rounded-xl border border-border bg-surface py-2 pl-8 pr-3 text-sm outline-none focus:border-teal"
          />
        </div>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-muted outline-none focus:border-teal"
        >
          <option value="">All roles</option>
          <option value="business">Business</option>
          <option value="advisor">Advisor</option>
          <option value="admin">Admin</option>
        </select>
        <span className="font-mono text-xs text-muted">{users.length} shown</span>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-ink/40 font-mono text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Business / sector</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted">
                    No users match.
                  </td>
                </tr>
              )}
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border/60 last:border-0 hover:bg-ink/30">
                  <td className="px-4 py-3">
                    <span className="font-medium text-text">{u.name}</span>
                    <span className="block text-xs text-muted/70">{u.email}</span>
                  </td>
                  <td className="px-4 py-3 capitalize text-muted">{u.role}</td>
                  <td className="px-4 py-3 text-muted">
                    {u.business_name || '—'}
                    {u.sector_label && <span className="block text-xs text-muted/70">{u.sector_label}</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={busyId === u.id || u.id === me?.id}
                      onClick={() => toggleActive(u)}
                      title={u.id === me?.id ? 'You can’t deactivate yourself' : ''}
                      className={`rounded-lg border px-2.5 py-1 text-xs transition disabled:opacity-40 ${
                        u.is_active
                          ? 'border-teal/40 bg-teal/10 text-teal hover:bg-teal/20'
                          : 'border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20'
                      }`}
                    >
                      {u.is_active ? 'Active' : 'Deactivated'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function QuestionRow({ q }) {
  const [saved, setSavedValues] = useState({ text: q.text, tip: q.tip });
  const [text, setText] = useState(q.text);
  const [tip, setTip] = useState(q.tip);
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const dirty = text !== saved.text || tip !== saved.tip;

  const save = async () => {
    setState('saving');
    setError('');
    try {
      const { data } = await api.patch(`/platform/questions/${q.id}`, { text, tip });
      setSavedValues({ text: data.text, tip: data.tip });
      setText(data.text);
      setTip(data.tip);
      setState('saved');
      setTimeout(() => setState('idle'), 1500);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save');
      setState('idle');
    }
  };

  return (
    <div className="rounded-lg border border-border bg-ink/30 p-3">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-teal">{q.category}</p>
      <label className="mb-2 block">
        <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted">Question</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={500}
          className="w-full rounded-lg border border-border bg-ink px-3 py-2 text-sm outline-none focus:border-teal"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted">
          Roadmap tip (shown when answered &quot;No&quot;)
        </span>
        <textarea
          value={tip}
          onChange={(e) => setTip(e.target.value)}
          rows={2}
          maxLength={500}
          className="w-full rounded-lg border border-border bg-ink px-3 py-2 text-sm outline-none focus:border-teal"
        />
      </label>
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || state === 'saving' || !text.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-teal/90 disabled:opacity-40"
        >
          {state === 'saved' ? <Check size={12} /> : <Save size={12} />}
          {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : 'Save'}
        </button>
        {error && <span className="text-xs text-red-300">{error}</span>}
      </div>
    </div>
  );
}

function QuestionsTab() {
  const [sectors, setSectors] = useState([]);
  const [sectorKey, setSectorKey] = useState('');
  const [questions, setQuestions] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/platform/questions', {
          params: sectorKey ? { sector: sectorKey } : {},
        });
        if (cancelled) return;
        setSectors(data.sectors || []);
        if (!sectorKey && data.sector) setSectorKey(data.sector.key);
        setQuestions(data.questions || []);
        setError('');
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || 'Failed to load questions');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sectorKey]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={sectorKey}
          onChange={(e) => setSectorKey(e.target.value)}
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-teal"
        >
          {sectors.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted">
          Edits apply to future assessments. You can change wording, but not add or remove questions —
          that would break scoring for past results.
        </p>
      </div>
      {error && <p className="mb-3 text-sm text-red-300">{error}</p>}
      <div className="space-y-3">
        {questions.map((q) => (
          <QuestionRow key={q.id} q={q} />
        ))}
      </div>
    </div>
  );
}

export default function AdminPortal() {
  const [tab, setTab] = useState('overview');

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <p className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-teal">Admin</p>
        <h1 className="font-display text-3xl font-bold">Platform administration</h1>
      </div>

      <div className="mb-6 flex w-fit rounded-xl border border-border p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${
              tab === id ? 'bg-amber text-ink' : 'text-muted hover:text-text'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview />}
      {tab === 'users' && <UsersTab />}
      {tab === 'questions' && <QuestionsTab />}
    </div>
  );
}
