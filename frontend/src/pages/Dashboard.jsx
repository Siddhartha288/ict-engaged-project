import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { Sparkles, RefreshCw, TrendingUp, MessageSquare } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import RadarScoreChart from '../components/RadarScoreChart';
import RoadmapCard from '../components/RoadmapCard';
import VendorFinder from '../components/VendorFinder';
import WebsiteAuditCard from '../components/WebsiteAuditCard';

export default function Dashboard() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [assessments, setAssessments] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [roadmap, setRoadmap] = useState(null);
  const [benchmark, setBenchmark] = useState(null);
  const [notes, setNotes] = useState([]);
  const [audit, setAudit] = useState(null);
  const [auditRunning, setAuditRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [roadmapLoading, setRoadmapLoading] = useState(false);
  const [error, setError] = useState('');

  const loadList = useCallback(async () => {
    const { data } = await api.get('/assessments');
    const list = data.assessments || [];
    setAssessments(list);
    const fromQuery = Number(searchParams.get('assessment'));
    const initial =
      (fromQuery && list.find((a) => a.id === fromQuery)?.id) || list[0]?.id || null;
    setSelectedId(initial);
    return initial;
  }, [searchParams]);

  const loadDetail = useCallback(async (id) => {
    if (!id) {
      setDetail(null);
      setRoadmap(null);
      setBenchmark(null);
      return;
    }
    const { data } = await api.get(`/assessments/${id}`);
    setDetail(data);
    try {
      const road = await api.get(`/assessments/${id}/roadmap`);
      setRoadmap(road.data.content);
    } catch {
      setRoadmap(null);
    }
    try {
      const bench = await api.get(`/assessments/${id}/benchmark`);
      setBenchmark(bench.data);
    } catch {
      setBenchmark(null);
    }
  }, []);

  useEffect(() => {
    if (!user || user.role !== 'business') return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/notes/${user.id}`);
        if (!cancelled) setNotes(data.notes || []);
      } catch {
        if (!cancelled) setNotes([]);
      }
      try {
        const { data } = await api.get('/audit');
        if (!cancelled) setAudit(data.audit || null);
      } catch {
        if (!cancelled) setAudit(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const runAudit = async (url) => {
    setAuditRunning(true);
    try {
      const { data } = await api.post('/audit', { url });
      setAudit(data);
    } finally {
      setAuditRunning(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const id = await loadList();
        if (!cancelled && id) await loadDetail(id);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || 'Failed to load dashboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadList, loadDetail]);

  useEffect(() => {
    if (!selectedId || loading) return;
    loadDetail(selectedId).catch((err) => {
      setError(err.response?.data?.message || 'Failed to load assessment');
    });
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const generateRoadmap = async () => {
    if (!selectedId) return;
    setRoadmapLoading(true);
    setError('');
    try {
      const { data } = await api.post(`/assessments/${selectedId}/roadmap`, {
        force: Boolean(roadmap),
      });
      setRoadmap(data.content);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to generate roadmap');
    } finally {
      setRoadmapLoading(false);
    }
  };

  const toggleAction = async (index, completed) => {
    if (!selectedId || !roadmap) return;
    const prevActions = roadmap.actions;
    const nextActions = prevActions.map((a, i) => (i === index ? { ...a, completed } : a));
    setRoadmap({ ...roadmap, actions: nextActions });
    try {
      await api.patch(`/assessments/${selectedId}/roadmap/actions/${index}`, { completed });
    } catch (err) {
      setRoadmap({ ...roadmap, actions: prevActions });
      setError(err.response?.data?.message || 'Failed to update action');
    }
  };

  const updateActionFinancials = async (index, fields) => {
    if (!selectedId || !roadmap) return;
    const prevActions = roadmap.actions;
    const nextActions = prevActions.map((a, i) => (i === index ? { ...a, ...fields } : a));
    setRoadmap({ ...roadmap, actions: nextActions });
    try {
      await api.patch(`/assessments/${selectedId}/roadmap/actions/${index}`, fields);
    } catch (err) {
      setRoadmap({ ...roadmap, actions: prevActions });
      setError(err.response?.data?.message || 'Failed to update action');
    }
  };

  const trendData = [...assessments]
    .reverse()
    .map((a) => ({
      date: new Date(a.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      score: a.score,
    }));

  if (loading) {
    return <div className="px-4 py-20 text-center font-mono text-sm text-muted">Loading dashboard…</div>;
  }

  if (!assessments.length) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="mb-3 font-display text-3xl font-bold">No assessments yet</h1>
        <p className="mb-6 text-sm text-muted">Take the 15-question quiz to see your maturity score.</p>
        <Link
          to="/assessment"
          className="inline-flex rounded-xl bg-amber px-5 py-3 text-sm font-semibold text-ink"
        >
          Start assessment
        </Link>
        <div className="mt-10 text-left">
          <WebsiteAuditCard audit={audit} onRun={runAudit} running={auditRunning} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-teal">Maturity dashboard</p>
          <h1 className="font-display text-3xl font-bold">Your digital score</h1>
        </div>
        <Link
          to="/assessment"
          className="rounded-xl border border-border px-4 py-2 text-sm text-muted transition hover:border-amber/40 hover:text-text"
        >
          Retake assessment
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        {assessments.map((a) => (
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
                <div className="mb-3 flex items-center gap-4 text-sm">
                  <span className="text-muted">
                    You: <span className="font-mono text-amber">{detail.total_score}%</span>
                  </span>
                  <span className="text-muted">
                    Sector avg: <span className="font-mono text-teal">{benchmark.overall_avg_score}%</span>
                  </span>
                </div>
                <div className="space-y-2">
                  {benchmark.categories.map((bc) => {
                    const mine = (detail.categories || []).find((c) => c.key === bc.key)?.score ?? 0;
                    return (
                      <div key={bc.key}>
                        <div className="mb-1 flex justify-between text-[11px] text-muted">
                          <span>{bc.label}</span>
                          <span className="font-mono">
                            {mine}% vs {bc.avg_score}% avg
                          </span>
                        </div>
                        <div className="relative h-1.5 rounded-full bg-ink/60">
                          <div
                            className="absolute h-1.5 rounded-full bg-amber"
                            style={{ width: `${Math.min(mine, 100)}%` }}
                          />
                          <div
                            className="absolute h-1.5 w-0.5 bg-teal"
                            style={{ left: `${Math.min(bc.avg_score, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {benchmark && benchmark.insufficient_data && (
              <p className="mt-5 border-t border-border pt-4 text-xs text-muted">
                Not enough other businesses in your sector yet to show a benchmark.
              </p>
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
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-display text-lg font-semibold">Action roadmap</h3>
                <button
                  type="button"
                  onClick={generateRoadmap}
                  disabled={roadmapLoading}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber px-4 py-2 text-sm font-semibold text-ink transition hover:bg-amber/90 disabled:opacity-60"
                >
                  {roadmapLoading ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" /> Generating…
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} /> {roadmap ? 'Regenerate' : 'Generate my roadmap'}
                    </>
                  )}
                </button>
              </div>

              {roadmap ? (
                <div className="space-y-4">
                  <p className="text-sm leading-relaxed text-muted">{roadmap.intro}</p>
                  {(roadmap.actions || []).length > 0 && (
                    <div>
                      {(() => {
                        const total = roadmap.actions.length;
                        const done = roadmap.actions.filter((a) => a.completed).length;
                        const pct = total ? Math.round((done / total) * 100) : 0;
                        return (
                          <>
                            <div className="mb-1 flex justify-between text-xs font-mono text-muted">
                              <span>Progress</span>
                              <span>
                                {done}/{total} done
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-ink/60">
                              <div
                                className="h-1.5 rounded-full bg-teal transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {(() => {
                    const totalCost = roadmap.actions.reduce((s, a) => s + (Number(a.cost) || 0), 0);
                    const totalBenefit = roadmap.actions.reduce(
                      (s, a) => s + (Number(a.expected_benefit) || 0),
                      0
                    );
                    if (totalCost === 0 && totalBenefit === 0) return null;
                    const roiPct = totalCost > 0 ? Math.round(((totalBenefit - totalCost) / totalCost) * 100) : null;
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
                          <p className={`font-mono text-sm ${roiPct == null ? 'text-muted' : roiPct >= 0 ? 'text-teal' : 'text-red-300'}`}>
                            {roiPct == null ? '—' : `${roiPct}%`}
                          </p>
                          <p className="text-[10px] uppercase tracking-wide text-muted">Projected ROI</p>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="space-y-3">
                    {(roadmap.actions || []).map((action, i) => (
                      <RoadmapCard
                        key={`${action.title}-${i}`}
                        action={action}
                        onToggleComplete={(completed) => toggleAction(i, completed)}
                        onUpdateFinancials={(fields) => updateActionFinancials(i, fields)}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted">
                  Generate a personalized plan based on this assessment&apos;s weak categories.
                </p>
              )}
            </div>

            <WebsiteAuditCard audit={audit} onRun={runAudit} running={auditRunning} />

            <VendorFinder />

            {notes.length > 0 && (
              <div className="rounded-xl border border-border bg-surface p-5">
                <h3 className="mb-4 flex items-center gap-1.5 font-display text-lg font-semibold">
                  <MessageSquare size={16} className="text-teal" /> Advisor notes
                </h3>
                <div className="space-y-3">
                  {notes.map((n) => (
                    <div key={n.id} className="rounded-lg border border-border bg-ink/40 p-3">
                      <p className="text-sm leading-relaxed text-text">{n.content}</p>
                      <p className="mt-2 font-mono text-[11px] text-muted">
                        {n.advisor_name} · {new Date(n.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
