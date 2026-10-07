import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowDownUp,
  Download,
  Search,
  AlertTriangle,
  Copy,
  Check,
  UserPlus,
  Users,
  TrendingUp,
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

const STATUS_OPTIONS = [
  { value: '', label: 'No status' },
  { value: 'needs_follow_up', label: 'Needs follow-up' },
  { value: 'on_track', label: 'On track' },
  { value: 'resolved', label: 'Resolved' },
];

const STATUS_STYLES = {
  needs_follow_up: 'border-red-500/40 bg-red-500/10 text-red-300',
  on_track: 'border-teal/40 bg-teal/10 text-teal',
  resolved: 'border-border bg-ink/50 text-muted',
};

function needsAttention(b) {
  if (!b.latest_assessment) return true;
  if (b.latest_assessment.score < 40) return true;
  if (b.note_count === 0) return true;
  return false;
}

function toCsvValue(value) {
  const str = value == null ? '' : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export default function AdvisorPortal() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [businesses, setBusinesses] = useState([]);
  const [impact, setImpact] = useState(null);
  // Advisors only ever see their own clients; there is no "all businesses" view.
  const scope = 'mine';
  const [newClient, setNewClient] = useState(null);
  const [newClientCopied, setNewClientCopied] = useState(false);
  const [sortAsc, setSortAsc] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState(null);
  const [codeCopied, setCodeCopied] = useState(false);

  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState('');
  const [scoreFilter, setScoreFilter] = useState('all');
  const [attentionOnly, setAttentionOnly] = useState(false);

  const [showAddClient, setShowAddClient] = useState(false);
  const [sectors, setSectors] = useState([]);
  const [clientForm, setClientForm] = useState({ name: '', email: '', business_name: '', sector: '' });
  const [addingClient, setAddingClient] = useState(false);

  const loadBusinesses = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/admin/businesses');
      setBusinesses(data.businesses || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load businesses');
    } finally {
      setLoading(false);
    }
  };

  const loadImpact = async () => {
    try {
      const { data } = await api.get('/admin/impact');
      setImpact(data);
    } catch {
      setImpact(null);
    }
  };

  useEffect(() => {
    loadBusinesses();
    loadImpact();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/sectors');
        if (!cancelled) setSectors(data.sectors || []);
      } catch {
        // Optional for the add-client form.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sectorOptions = useMemo(() => {
    const map = new Map();
    for (const b of businesses) {
      if (b.sector_key && !map.has(b.sector_key)) map.set(b.sector_key, b.sector_label);
    }
    return [...map.entries()];
  }, [businesses]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return businesses.filter((b) => {
      if (term) {
        const haystack = `${b.business_name || ''} ${b.name} ${b.email}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (sectorFilter && b.sector_key !== sectorFilter) return false;
      if (scoreFilter !== 'all') {
        const score = b.latest_assessment?.score;
        if (scoreFilter === 'unassessed' && score != null) return false;
        if (scoreFilter === 'low' && !(score != null && score < 40)) return false;
        if (scoreFilter === 'mid' && !(score != null && score >= 40 && score < 70)) return false;
        if (scoreFilter === 'high' && !(score != null && score >= 70)) return false;
      }
      if (attentionOnly && !needsAttention(b)) return false;
      return true;
    });
  }, [businesses, search, sectorFilter, scoreFilter, attentionOnly]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const sa = a.latest_assessment?.score;
      const sb = b.latest_assessment?.score;
      if (sa == null && sb == null) return a.name.localeCompare(b.name);
      if (sa == null) return 1;
      if (sb == null) return -1;
      return sortAsc ? sa - sb : sb - sa;
    });
    return copy;
  }, [filtered, sortAsc]);

  const updateStatus = async (businessId, status) => {
    setUpdatingId(businessId);
    setError('');
    try {
      await api.patch(`/admin/businesses/${businessId}/status`, { status: status || null });
      setBusinesses((prev) =>
        prev.map((b) => (b.id === businessId ? { ...b, follow_up_status: status || null } : b))
      );
      loadImpact();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update status');
    } finally {
      setUpdatingId(null);
    }
  };

  const exportCsv = () => {
    const headers = ['Business', 'Sector', 'Owner', 'Email', 'Score', 'Level', 'Assessed', 'Status', 'Notes'];
    const rows = sorted.map((b) => [
      b.business_name || '',
      b.sector_label || '',
      b.name,
      b.email,
      b.latest_assessment ? b.latest_assessment.score : '',
      b.latest_assessment?.level || '',
      b.latest_assessment ? new Date(b.latest_assessment.date).toLocaleDateString() : '',
      STATUS_OPTIONS.find((s) => s.value === (b.follow_up_status || ''))?.label || '',
      b.note_count,
    ]);
    const csv = [headers, ...rows].map((r) => r.map(toCsvValue).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `businesses-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const inviteLink = user?.advisor_code
    ? `${window.location.origin}/register?code=${user.advisor_code}`
    : '';

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      // Clipboard API may be unavailable; the code is still visible to copy manually.
    }
  };

  const submitAddClient = async (e) => {
    e.preventDefault();
    setAddingClient(true);
    setError('');
    try {
      const { data } = await api.post('/admin/businesses', clientForm);
      setShowAddClient(false);
      setClientForm({ name: '', email: '', business_name: '', sector: '' });
      setNewClientCopied(false);
      setNewClient(data); // shows the claim code before moving on to the assessment
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add client');
    } finally {
      setAddingClient(false);
    }
  };

  if (loading && businesses.length === 0) {
    return <div className="px-4 py-20 text-center font-mono text-sm text-muted">Loading businesses…</div>;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-teal">Advisor portal</p>
          <h1 className="font-display text-3xl font-bold">Business overview</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAddClient((v) => !v)}
            className="inline-flex items-center gap-2 rounded-xl bg-amber px-3 py-2 text-sm font-semibold text-ink transition hover:bg-amber/90"
          >
            <UserPlus size={14} /> Add client
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-muted transition hover:border-teal/40 hover:text-text"
          >
            <Download size={14} /> Export CSV
          </button>
          <button
            type="button"
            onClick={() => setSortAsc((v) => !v)}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-muted transition hover:border-teal/40 hover:text-text"
          >
            <ArrowDownUp size={14} />
            Score {sortAsc ? '↑ low to high' : '↓ high to low'}
          </button>
        </div>
      </div>

      {user?.advisor_code && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4">
          <div className="flex-1">
            <p className="font-mono text-xs uppercase tracking-wide text-muted">Your invite code</p>
            <p className="font-mono text-lg text-amber">{user.advisor_code}</p>
          </div>
          <div className="min-w-0 flex-[2]">
            <p className="font-mono text-xs uppercase tracking-wide text-muted">Share this link with clients</p>
            <p className="truncate text-sm text-teal">{inviteLink}</p>
          </div>
          <button
            type="button"
            onClick={copyInvite}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted transition hover:border-teal/40 hover:text-text"
          >
            {codeCopied ? <Check size={12} /> : <Copy size={12} />}
            {codeCopied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      )}

      {impact && impact.caseload_size > 0 && (
        <div className="mb-6 rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 flex items-center gap-1.5 font-display text-sm font-semibold text-text">
            <TrendingUp size={14} className="text-teal" /> Your impact{' '}
            <span className="font-normal text-muted">({scope === 'mine' ? 'my clients' : 'all businesses'})</span>
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="rounded-lg bg-ink/50 px-3 py-2 text-center">
              <p className="font-mono text-lg text-text">{impact.caseload_size}</p>
              <p className="text-[10px] uppercase tracking-wide text-muted">Caseload</p>
            </div>
            <div className="rounded-lg bg-ink/50 px-3 py-2 text-center">
              <p className="font-mono text-lg text-amber">
                {impact.average_current_score != null ? `${impact.average_current_score}%` : '—'}
              </p>
              <p className="text-[10px] uppercase tracking-wide text-muted">Avg score</p>
            </div>
            <div className="rounded-lg bg-ink/50 px-3 py-2 text-center">
              <p
                className={`font-mono text-lg ${
                  impact.average_improvement == null
                    ? 'text-muted'
                    : impact.average_improvement >= 0
                      ? 'text-teal'
                      : 'text-red-300'
                }`}
              >
                {impact.average_improvement != null
                  ? `${impact.average_improvement > 0 ? '+' : ''}${impact.average_improvement}%`
                  : '—'}
              </p>
              <p className="text-[10px] uppercase tracking-wide text-muted">
                Avg improvement{impact.improved_business_count ? ` (${impact.improved_business_count})` : ''}
              </p>
            </div>
            <div className="rounded-lg bg-ink/50 px-3 py-2 text-center">
              <p className="font-mono text-lg text-teal">{impact.status_breakdown.on_track}</p>
              <p className="text-[10px] uppercase tracking-wide text-muted">On track</p>
            </div>
            <div className="rounded-lg bg-ink/50 px-3 py-2 text-center">
              <p className="font-mono text-lg text-red-300">{impact.status_breakdown.needs_follow_up}</p>
              <p className="text-[10px] uppercase tracking-wide text-muted">Needs follow-up</p>
            </div>
          </div>
        </div>
      )}

      {newClient && (
        <div className="mb-6 rounded-xl border border-teal/40 bg-teal/5 p-4">
          <p className="mb-1 text-sm text-text">
            Account created for <span className="font-semibold">{newClient.business_name || newClient.name}</span>.
          </p>
          <p className="mb-3 text-xs text-muted">
            To set their own password later, your client uses the Claim page with their email and this one-time code. It
            is shown only now — write it down or copy it. (You can always make a new one from their page.)
          </p>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-lg border border-amber/40 bg-amber/10 px-3 py-1.5 font-mono text-lg tracking-widest text-amber">
              {newClient.claim_code}
            </span>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(newClient.claim_code);
                  setNewClientCopied(true);
                } catch {
                  // Clipboard may be blocked; the code is visible to copy by hand.
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition hover:text-text"
            >
              {newClientCopied ? <Check size={12} /> : <Copy size={12} />} {newClientCopied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button
            type="button"
            onClick={() => navigate(`/advisor/businesses/${newClient.id}/assessment`)}
            className="rounded-xl bg-amber px-4 py-2 text-sm font-semibold text-ink transition hover:bg-amber/90"
          >
            Run their assessment now
          </button>
        </div>
      )}

      {showAddClient && (
        <form
          onSubmit={submitAddClient}
          className="mb-6 grid gap-3 rounded-xl border border-amber/40 bg-surface p-4 sm:grid-cols-2"
        >
          <label className="block">
            <span className="mb-1 block text-xs font-mono uppercase tracking-wide text-muted">Owner name</span>
            <input
              required
              value={clientForm.name}
              onChange={(e) => setClientForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-lg border border-border bg-ink px-3 py-2 text-sm outline-none focus:border-amber"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-mono uppercase tracking-wide text-muted">Email</span>
            <input
              type="email"
              required
              value={clientForm.email}
              onChange={(e) => setClientForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full rounded-lg border border-border bg-ink px-3 py-2 text-sm outline-none focus:border-amber"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-mono uppercase tracking-wide text-muted">
              Business name
            </span>
            <input
              value={clientForm.business_name}
              onChange={(e) => setClientForm((f) => ({ ...f, business_name: e.target.value }))}
              placeholder="Optional"
              className="w-full rounded-lg border border-border bg-ink px-3 py-2 text-sm outline-none focus:border-amber"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-mono uppercase tracking-wide text-muted">Sector</span>
            <select
              required
              value={clientForm.sector}
              onChange={(e) => setClientForm((f) => ({ ...f, sector: e.target.value }))}
              className="w-full rounded-lg border border-border bg-ink px-3 py-2 text-sm outline-none focus:border-amber"
            >
              <option value="" disabled>
                Select sector…
              </option>
              {sectors.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-2 flex items-center gap-2">
            <button
              type="submit"
              disabled={addingClient}
              className="rounded-xl bg-amber px-4 py-2 text-sm font-semibold text-ink transition hover:bg-amber/90 disabled:opacity-60"
            >
              {addingClient ? 'Adding…' : 'Add client & run assessment'}
            </button>
            <button
              type="button"
              onClick={() => setShowAddClient(false)}
              className="rounded-xl border border-border px-4 py-2 text-sm text-muted transition hover:text-text"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm text-text">
          <Users size={14} className="text-teal" /> My clients
        </span>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search business, owner, or email…"
            className="w-64 rounded-xl border border-border bg-surface py-2 pl-8 pr-3 text-sm outline-none focus:border-teal"
          />
        </div>
        <select
          value={sectorFilter}
          onChange={(e) => setSectorFilter(e.target.value)}
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-muted outline-none focus:border-teal"
        >
          <option value="">All sectors</option>
          {sectorOptions.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={scoreFilter}
          onChange={(e) => setScoreFilter(e.target.value)}
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-muted outline-none focus:border-teal"
        >
          <option value="all">All scores</option>
          <option value="unassessed">Not assessed</option>
          <option value="low">Below 40%</option>
          <option value="mid">40–69%</option>
          <option value="high">70%+</option>
        </select>
        <button
          type="button"
          onClick={() => setAttentionOnly((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition ${
            attentionOnly
              ? 'border-red-500/50 bg-red-500/10 text-red-300'
              : 'border-border text-muted hover:border-red-500/30 hover:text-text'
          }`}
        >
          <AlertTriangle size={14} /> Needs attention
        </button>
        <span className="font-mono text-xs text-muted">
          {sorted.length} of {businesses.length}
        </span>
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
                <th className="px-4 py-3 font-medium">Business</th>
                <th className="px-4 py-3 font-medium">Sector</th>
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Level</th>
                <th className="px-4 py-3 font-medium">Assessed</th>
                <th className="px-4 py-3 font-medium">Notes</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted">
                    {scope === 'mine'
                      ? "No clients yet — share your invite link or click \"Add client\"."
                      : 'No businesses match these filters.'}
                  </td>
                </tr>
              )}
              {sorted.map((b) => (
                <tr key={b.id} className="border-b border-border/60 last:border-0 hover:bg-ink/30">
                  <td className="px-4 py-3 font-medium text-text">
                    <Link to={`/advisor/businesses/${b.id}`} className="hover:text-teal hover:underline">
                      {b.business_name || b.name || '—'}
                    </Link>
                    {needsAttention(b) && (
                      <AlertTriangle size={12} className="ml-1.5 inline-block text-amber" />
                    )}
                    {!b.claimed && (
                      <span className="ml-1.5 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted">
                        unclaimed
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{b.sector_label || '—'}</td>
                  <td className="px-4 py-3 text-muted">
                    {b.name}
                    <span className="block text-xs text-muted/70">{b.email}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-amber">
                    {b.latest_assessment ? `${b.latest_assessment.score}%` : '—'}
                  </td>
                  <td className="px-4 py-3 text-teal">
                    {b.latest_assessment?.level || 'Not assessed'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">
                    {b.latest_assessment
                      ? new Date(b.latest_assessment.date).toLocaleDateString()
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-muted">{b.note_count}</td>
                  <td className="px-4 py-3">
                    <select
                      value={b.follow_up_status || ''}
                      disabled={updatingId === b.id}
                      onChange={(e) => updateStatus(b.id, e.target.value)}
                      className={`rounded-lg border px-2 py-1 text-xs outline-none disabled:opacity-50 ${
                        STATUS_STYLES[b.follow_up_status] || 'border-border bg-ink/50 text-muted'
                      }`}
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
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
