import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { ArrowLeft, ClipboardList, FileText, MessageSquare, Send, TrendingUp } from 'lucide-react';
import api from '../api/client';
import RadarScoreChart from '../components/RadarScoreChart';
import RoadmapCard from '../components/RoadmapCard';
import WebsiteAuditCard from '../components/WebsiteAuditCard';

const STATUS_OPTIONS = [
  { value: '', label: 'No status' },
  { value: 'needs_follow_up', label: 'Needs follow-up' },
  { value: 'on_track', label: 'On track' },
  { value: 'resolved', label: 'Resolved' },
];

export default function BusinessDetail() {
  const { id } = useParams();
  const [business, setBusiness] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [roadmap, setRoadmap] = useState(null);
  const [benchmark, setBenchmark] = useState(null);
  const [notes, setNotes] = useState([]);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadBusiness = useCallback(async () => {
    const { data } = await api.get(`/admin/businesses/${id}`);
    setBusiness(data);
    const latest = data.assessments?.[0]?.id || null;
    setSelectedId(latest);
    return latest;
  }, [id]);

  const loadNotes = useCallback(async () => {
    try {
      const { data } = await api.get(`/notes/${id}`);
      setNotes(data.notes || []);
    } catch {
      setNotes([]);
    }
  }, [id]);

  const loadAssessmentDetail = useCallback(async (assessmentId) => {
    if (!assessmentId) {
      setDetail(null);
      setRoadmap(null);
      setBenchmark(null);
      return;
    }
    const { data } = await api.get(`/assessments/${assessmentId}`);
    setDetail(data);
    try {
      const road = await api.get(`/assessments/${assessmentId}/roadmap`);
      setRoadmap(road.data.content);
    } catch {
      setRoadmap(null);
    }
    try {
      const bench = await api.get(`/assessments/${assessmentId}/benchmark`);
      setBenchmark(bench.data);
    } catch {
      setBenchmark(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const latest = await loadBusiness();
        await loadNotes();
        if (!cancelled) await loadAssessmentDetail(latest);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || 'Failed to load business');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadBusiness, loadNotes, loadAssessmentDetail]);

  useEffect(() => {
    if (!selectedId || loading) return;
    loadAssessmentDetail(selectedId).catch((err) => {
      setError(err.response?.data?.message || 'Failed to load assessment');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const updateStatus = async (status) => {
    setStatusSaving(true);
    setError('');
    try {
      await api.patch(`/admin/businesses/${id}/status`, { status: status || null });
      setBusiness((prev) => ({ ...prev, follow_up_status: status || null }));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update status');
    } finally {
      setStatusSaving(false);
    }
  };

  const submitNote = async () => {
    const content = draft.trim();
    if (!content) return;
    setPosting(true);
    setError('');
    try {
      await api.post(`/notes/${id}`, { content });
      setDraft('');
      await loadNotes();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to post note');
    } finally {
      setPosting(false);
    }
  };

  const trendData = business
    ? [...business.assessments]
        .reverse()
        .map((a) => ({
          date: new Date(a.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          score: a.score,
        }))
    : [];

  if (loading) {
    return <div className="px-4 py-20 text-center font-mono text-sm text-muted">Loading business…</div>;
  }

  if (!business) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center text-sm text-red-300">
        {error || 'Business not found'}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link
        to="/advisor"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-text"
      >
        <ArrowLeft size={14} /> Back to overview
      </Link>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-teal">
            {business.sector_label || 'No sector'}
          </p>
          <h1 className="font-display text-3xl font-bold">{business.business_name || business.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {business.name} · {business.email}
            {!business.claimed && (
              <span className="ml-1.5 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted">
                unclaimed
              </span>
            )}
          </p>
        </div>
        <div className="flex items-end gap-3">
          <Link
            to={`/advisor/businesses/${business.id}/report`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm text-muted transition hover:border-teal/40 hover:text-text"
          >
            <FileText size={14} /> View report
          </Link>
          <Link
            to={`/advisor/businesses/${business.id}/assessment`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm text-muted transition hover:border-teal/40 hover:text-text"
          >
            <ClipboardList size={14} /> Run assessment
          </Link>
        <label className="block">
          <span className="mb-1.5 block text-xs font-mono uppercase tracking-wide text-muted">
            Follow-up status
          </span>
          <select
            value={business.follow_up_status || ''}
            disabled={statusSaving}
            onChange={(e) => updateStatus(e.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-teal disabled:opacity-50"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          </label>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {business.assessments.length === 0 ? (
        <p className="text-sm text-muted">This business hasn&apos;t taken an assessment yet.</p>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap gap-2">
            {business.assessments.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setSelectedId(a.id)}
                className={`rounded-xl border px-3 py-2 text-left text-xs font-mono transition ${
                  selectedId === a.id
                    ? 'border-amber bg-amber/10 text-amber'
                    : 'border-border text-muted hover:text-text'
                }`}
              >
                {new Date(a.date).toLocaleDateString()} · {a.score}%
              </button>
            ))}
          </div>

          {detail && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-surface p-5">
                <div className="mb-4 flex items-baseline justify-between">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-wide text-muted">Overall level</p>
                    <h2 className="font-display text-2xl font-semibold text-text">{detail.level}</h2>
                  </div>
                  <p className="font-mono text-4xl font-semibold text-amber">{detail.total_score}</p>
                </div>
                <RadarScoreChart categories={detail.categories || []} />
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {(detail.categories || []).map((c) => (
                    <div key={c.key || c.label} className="rounded-lg bg-ink/50 px-2 py-2 text-center">
                      <p className="font-mono text-sm text-teal">{c.score}%</p>
                      <p className="truncate text-[10px] text-muted">{c.label}</p>
                    </div>
                  ))}
                </div>

                {benchmark && !benchmark.insufficient_data && (
                  <div className="mt-5 border-t border-border pt-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="flex items-center gap-1.5 font-display text-sm font-semibold text-text">
                        <TrendingUp size={14} className="text-teal" /> {benchmark.sector_label} benchmark
                      </h3>
                      <span className="font-mono text-xs text-muted">{benchmark.sample_size} businesses</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted">
                        This business: <span className="font-mono text-amber">{detail.total_score}%</span>
                      </span>
                      <span className="text-muted">
                        Sector avg: <span className="font-mono text-teal">{benchmark.overall_avg_score}%</span>
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-6">
                {trendData.length > 1 && (
                  <div className="rounded-xl border border-border bg-surface p-5">
                    <h3 className="mb-4 font-display text-lg font-semibold">Score trend</h3>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trendData}>
                          <CartesianGrid stroke="#2A2A42" strokeDasharray="3 3" />
                          <XAxis dataKey="date" tick={{ fill: '#9C9BB3', fontSize: 11 }} />
                          <YAxis domain={[0, 100]} tick={{ fill: '#9C9BB3', fontSize: 11 }} />
                          <Tooltip
                            contentStyle={{
                              background: '#1B1B2C',
                              border: '1px solid #2A2A42',
                              borderRadius: 12,
                            }}
                          />
                          <Line type="monotone" dataKey="score" stroke="#F5A623" strokeWidth={2} dot />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-border bg-surface p-5">
                  <h3 className="mb-4 font-display text-lg font-semibold">Action roadmap</h3>
                  {roadmap ? (
                    <div className="space-y-4">
                      <p className="text-sm leading-relaxed text-muted">{roadmap.intro}</p>
                      {(() => {
                        const totalCost = roadmap.actions.reduce((s, a) => s + (Number(a.cost) || 0), 0);
                        const totalBenefit = roadmap.actions.reduce(
                          (s, a) => s + (Number(a.expected_benefit) || 0),
                          0
                        );
                        if (totalCost === 0 && totalBenefit === 0) return null;
                        const roiPct =
                          totalCost > 0 ? Math.round(((totalBenefit - totalCost) / totalCost) * 100) : null;
                        return (
                          <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-ink/40 p-3 text-center">
                            <div>
                              <p className="font-mono text-sm text-text">${totalCost.toLocaleString()}</p>
                              <p className="text-[10px] uppercase tracking-wide text-muted">Planned investment</p>
                            </div>
                            <div>
                              <p className="font-mono text-sm text-teal">${totalBenefit.toLocaleString()}</p>
                              <p className="text-[10px] uppercase tracking-wide text-muted">Expected benefit</p>
                            </div>
                            <div>
                              <p
                                className={`font-mono text-sm ${
                                  roiPct == null ? 'text-muted' : roiPct >= 0 ? 'text-teal' : 'text-red-300'
                                }`}
                              >
                                {roiPct == null ? '—' : `${roiPct}%`}
                              </p>
                              <p className="text-[10px] uppercase tracking-wide text-muted">Projected ROI</p>
                            </div>
                          </div>
                        );
                      })()}
                      <div className="space-y-3">
                        {(roadmap.actions || []).map((action, i) => (
                          <RoadmapCard key={`${action.title}-${i}`} action={action} />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted">No roadmap generated for this assessment yet.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <div className="mt-6 rounded-xl border border-border bg-surface p-5">
        <h3 className="mb-4 flex items-center gap-1.5 font-display text-lg font-semibold">
          <MessageSquare size={16} className="text-teal" /> Notes
        </h3>
        <div className="mb-4 space-y-3">
          {notes.length === 0 ? (
            <p className="text-xs text-muted">No notes yet.</p>
          ) : (
            notes.map((n) => (
              <div key={n.id} className="rounded-lg border border-border bg-ink/40 p-3">
                <p className="text-sm leading-relaxed text-text">{n.content}</p>
                <p className="mt-2 font-mono text-[11px] text-muted">
                  {n.advisor_name} · {new Date(n.created_at).toLocaleDateString()}
                </p>
              </div>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a note for this business…"
            maxLength={2000}
            className="flex-1 rounded-lg border border-border bg-ink px-3 py-2 text-sm outline-none focus:border-teal"
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitNote();
            }}
          />
          <button
            type="button"
            onClick={submitNote}
            disabled={posting || !draft.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal px-3 py-2 text-xs font-semibold text-ink transition hover:bg-teal/90 disabled:opacity-60"
          >
            <Send size={12} /> Send
          </button>
        </div>
      </div>

      <div className="mt-6">
        <WebsiteAuditCard audit={business.website_audit} />
      </div>
    </div>
  );
}
