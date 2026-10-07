import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Printer, Sparkles, ListChecks } from 'lucide-react';
import api from '../api/client';

// Public, read-only view of a shared report. No login; reached by an unguessable link.
export default function SharedReport() {
  const { token } = useParams();
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/shared/${encodeURIComponent(token)}`)
      .then(({ data }) => {
        if (!cancelled) setReport(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err.response?.status === 404
              ? 'This link is invalid or has expired. Ask the business for a new one.'
              : err.response?.data?.message || 'Could not load this report.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return <div className="px-4 py-20 text-center font-mono text-sm text-muted">Loading report…</div>;
  }

  if (error || !report) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="mb-4 text-sm text-red-300">{error}</p>
        <Link to="/" className="text-sm text-teal hover:underline">
          Go to BizTransform
        </Link>
      </div>
    );
  }

  const actions = report.roadmap?.actions || [];
  const writer =
    report.roadmap?.generated_by === 'gemini' || report.roadmap?.generated_by === 'claude'
      ? { Icon: Sparkles, text: 'Roadmap written with AI from the assessment answers' }
      : report.roadmap?.generated_by === 'rules'
        ? { Icon: ListChecks, text: 'Roadmap built from the assessment answers with built-in rules' }
        : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="no-print mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-amber px-4 py-2 text-sm font-semibold text-ink transition hover:bg-amber/90"
        >
          <Printer size={14} /> Print / Save as PDF
        </button>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 sm:p-8">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-teal">Digital maturity report</p>
        <h1 className="mt-1 font-display text-3xl font-bold">{report.business_name}</h1>
        <p className="mt-1 text-sm text-muted">
          {report.sector_label || 'No sector'} · Assessed {new Date(report.assessed_at).toLocaleDateString()}
        </p>

        <div className="my-6 flex items-end justify-between rounded-xl bg-ink/50 px-5 py-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-wide text-muted">Overall level</p>
            <p className="font-display text-2xl font-semibold">{report.level}</p>
          </div>
          <p className="font-mono text-5xl font-semibold text-amber">{report.total_score}%</p>
        </div>

        <h2 className="mb-3 font-display text-lg font-semibold">Category breakdown</h2>
        <div className="mb-8 space-y-3">
          {report.categories.map((c) => (
            <div key={c.key || c.label}>
              <div className="mb-1 flex justify-between text-sm">
                <span>{c.label}</span>
                <span className="font-mono text-muted">{c.score}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-ink/60">
                <div className="h-full rounded-full bg-gradient-to-r from-teal to-amber" style={{ width: `${c.score}%` }} />
              </div>
            </div>
          ))}
        </div>

        {report.roadmap && (
          <>
            <h2 className="mb-2 font-display text-lg font-semibold">Action roadmap</h2>
            <p className="mb-1 text-sm leading-relaxed text-muted">{report.roadmap.intro}</p>
            {writer && (
              <p className="mb-4 inline-flex items-center gap-1.5 font-mono text-[11px] text-muted/80">
                <writer.Icon size={12} /> {writer.text}
              </p>
            )}
            <ol className="space-y-3">
              {actions.map((a) => (
                <li key={`${a.priority}-${a.title}`} className="rounded-lg border border-border/70 p-4">
                  <div className="mb-1 flex items-start justify-between gap-3">
                    <h3 className="font-display text-base font-semibold">
                      {a.priority}. {a.title}
                    </h3>
                    {a.completed && (
                      <span className="shrink-0 rounded-full border border-teal/50 bg-teal/15 px-2 py-0.5 text-xs text-teal">
                        Done
                      </span>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed text-muted">{a.description}</p>
                  <p className="mt-2 font-mono text-xs text-muted">
                    {a.category} · {a.timeframe}
                  </p>
                </li>
              ))}
            </ol>
          </>
        )}

        <p className="mt-8 border-t border-border pt-4 text-[11px] text-muted">
          Shared via BizTransform, a student prototype. Scores come from the business&apos;s own yes/no answers and are
          indicative only. This link expires on {new Date(report.expires_at).toLocaleDateString()}.
        </p>
      </div>
    </div>
  );
}
