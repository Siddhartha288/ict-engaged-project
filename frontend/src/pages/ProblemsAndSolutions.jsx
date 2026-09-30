import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

const ROWS = [
  {
    problem: 'Limited digital-transformation knowledge',
    impact: 'Owners may not know their current maturity or what to improve first.',
    response: 'Assessment, gap analysis and a prioritised roadmap.',
  },
  {
    problem: 'Fragmented manual processes',
    impact: 'Paper, spreadsheets and disconnected tools create delay and duplication.',
    response: 'Process-focused questions that surface where digitisation and automation would help most.',
  },
  {
    problem: 'Uncertain technology selection',
    impact: 'Businesses may know they need technology but not which option fits.',
    response: 'Sector-tailored, explainable recommendations with concrete tool suggestions.',
  },
  {
    problem: 'Weak data-driven decisions',
    impact: 'Decisions can rely on intuition instead of operational evidence.',
    response: 'Category breakdowns, score trends and sector benchmarking.',
  },
  {
    problem: 'No benefit measurement',
    impact: 'Technology can be implemented without evidence of improvement.',
    response: 'Roadmap progress tracking, before/after scoring, and projected ROI on planned actions.',
  },
  {
    problem: 'Disconnected stakeholders',
    impact: 'Business owners and advisors use separate channels with no shared record.',
    response: 'A shared dashboard between businesses and advisors, with notes and follow-up status.',
  },
];

export default function ProblemsAndSolutions() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <div className="mb-8 text-center">
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-teal">Why BizTransform</p>
        <h1 className="font-display text-3xl font-bold">Problems &amp; solutions</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-muted">
          Most small businesses have a transformation problem, not just a software problem — adopting
          individual tools without understanding readiness, process dependencies, or measurable benefit.
          Here&apos;s how BizTransform responds to each part of that.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-ink/40 font-mono text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Business problem</th>
                <th className="px-4 py-3 font-medium">Business impact</th>
                <th className="px-4 py-3 font-medium">BizTransform response</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.problem} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-4 align-top font-medium text-text">{row.problem}</td>
                  <td className="px-4 py-4 align-top text-muted">{row.impact}</td>
                  <td className="px-4 py-4 align-top text-teal">{row.response}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-10 text-center">
        <Link
          to="/register"
          className="inline-flex items-center gap-2 rounded-xl bg-amber px-5 py-3 text-sm font-semibold text-ink transition hover:bg-amber/90"
        >
          See where your business stands <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}
