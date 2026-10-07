import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Sparkles, Printer } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

const STATUS_LABELS = {
  needs_follow_up: 'Needs follow-up',
  on_track: 'On track',
  resolved: 'Resolved',
};

export default function BusinessReport() {
  const { id } = useParams();
  const { user } = useAuth();
  const [business, setBusiness] = useState(null);
  const [detail, setDetail] = useState(null);
  const [roadmap, setRoadmap] = useState(null);
  const [benchmark, setBenchmark] = useState(null);
  const [noteCount, setNoteCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const { data: businessData } = await api.get(`/admin/businesses/${id}`);
        if (cancelled) return;
        setBusiness(businessData);

        const latestId = businessData.assessments?.[0]?.id;
        if (latestId) {
          const [detailRes, roadmapRes, benchRes, notesRes] = await Promise.all([
            api.get(`/assessments/${latestId}`),
            api.get(`/assessments/${latestId}/roadmap`).catch(() => null),
            api.get(`/assessments/${latestId}/benchmark`).catch(() => null),
            api.get(`/notes/${id}`).catch(() => null),
          ]);
          if (cancelled) return;
          setDetail(detailRes.data);
          setRoadmap(roadmapRes?.data?.content || null);
          setBenchmark(benchRes?.data || null);
          setNoteCount(notesRes?.data?.notes?.length || 0);
        }
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || 'Failed to load report');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return <div className="px-4 py-20 text-center font-mono text-sm text-gray-500">Loading report…</div>;
  }

  if (!business || error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center text-sm text-red-600">
        {error || 'Business not found'}
      </div>
    );
  }

  const topActions = (roadmap?.actions || []).slice(0, 5);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="no-print mx-auto flex max-w-3xl items-center justify-end px-6 py-4">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600"
        >
          <Printer size={16} /> Print / Save as PDF
        </button>
      </div>

      <div className="mx-auto max-w-3xl px-8 py-6 print:px-0 print:py-0">
        <div className="mb-8 flex items-center justify-between border-b-2 border-gray-900 pb-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 text-white">
              <Sparkles size={18} />
            </span>
            <span className="text-xl font-bold tracking-tight">BizTransform</span>
          </div>
          <div className="text-right text-xs text-gray-500">
            <p className="font-semibold uppercase tracking-wide">Digital Maturity Report</p>
            <p>Generated {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
        </div>

        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">
            {business.sector_label || 'No sector'}
          </p>
          <h1 className="text-3xl font-bold">{business.business_name || business.name}</h1>
          <p className="mt-1 text-sm text-gray-600">
            Owner: {business.name} · {business.email}
          </p>
          {business.follow_up_status && (
            <p className="mt-1 text-sm text-gray-600">
              Status: {STATUS_LABELS[business.follow_up_status] || business.follow_up_status}
            </p>
          )}
        </div>

        {!detail ? (
          <p className="text-sm text-gray-600">This business has not completed an assessment yet.</p>
        ) : (
          <>
            <div className="mb-8 flex items-center justify-between rounded-xl border border-gray-200 p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Overall level</p>
                <h2 className="text-2xl font-bold">{detail.level}</h2>
                <p className="mt-1 text-xs text-gray-500">
                  Assessed {new Date(detail.created_at).toLocaleDateString()}
                </p>
              </div>
              <p className="text-5xl font-bold text-amber-600">{detail.total_score}%</p>
            </div>

            <div className="mb-8">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Category breakdown
              </h3>
              <div className="space-y-2">
                {(detail.categories || []).map((c) => (
                  <div key={c.key || c.label}>
                    <div className="mb-1 flex justify-between text-xs text-gray-600">
                      <span>{c.label}</span>
                      <span className="font-semibold">{c.score}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100">
                      <div
                        className="h-2 rounded-full bg-amber-500"
                        style={{ width: `${Math.min(c.score, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {benchmark && !benchmark.insufficient_data && (
              <div className="mb-8 rounded-xl border border-gray-200 p-5">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  {benchmark.sector_label} benchmark
                </h3>
                <p className="text-sm text-gray-700">
                  This business scored <span className="font-semibold text-amber-600">{detail.total_score}%</span>,
                  compared to a sector average of{' '}
                  <span className="font-semibold text-teal-600">{benchmark.overall_avg_score}%</span> across{' '}
                  {benchmark.sample_size} businesses
                  {benchmark.small_sample ? ' (a small sample, so indicative only)' : ''}.
                  {benchmark.includes_demo ? ' Includes demo data.' : ''}
                </p>
              </div>
            )}

            {topActions.length > 0 && (
              <div className="mb-8">
                <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Priority actions
                </h3>
                {roadmap?.intro && <p className="mb-3 text-sm text-gray-700">{roadmap.intro}</p>}
                <div className="space-y-3">
                  {topActions.map((action, i) => (
                    <div key={`${action.title}-${i}`} className="rounded-lg border border-gray-200 p-4">
                      <div className="mb-1 flex items-center justify-between">
                        <h4 className="font-semibold">
                          {action.priority}. {action.title}
                        </h4>
                        <span className="text-xs text-gray-500">{action.timeframe}</span>
                      </div>
                      <p className="text-sm text-gray-600">{action.description}</p>
                      {(action.cost != null || action.expected_benefit != null) && (
                        <p className="mt-2 text-xs text-gray-500">
                          {action.cost != null && `Est. cost: $${Number(action.cost).toLocaleString()}`}
                          {action.cost != null && action.expected_benefit != null && ' · '}
                          {action.expected_benefit != null &&
                            `Expected benefit: $${Number(action.expected_benefit).toLocaleString()}`}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="mt-10 border-t border-gray-200 pt-4 text-xs text-gray-500">
          <p>
            Prepared by {user?.name || 'your advisor'}
            {noteCount > 0 ? ` · ${noteCount} advisor note${noteCount === 1 ? '' : 's'} on file` : ''}.
          </p>
          <p className="mt-1">
            This report is generated by BizTransform and reflects self-reported assessment data. Recommendations
            are advisory and should be reviewed with your advisor before acting on them.
          </p>
        </div>
      </div>
    </div>
  );
}
