import { useState } from 'react';
import { Clock3, ArrowUpRight, ExternalLink, Check, DollarSign } from 'lucide-react';
import { VendorLink } from './VendorFinder';
import ActionGuide from './ActionGuide';

function formatAud(value) {
  if (value == null) return null;
  return `$${Number(value).toLocaleString()}`;
}

function FinancialField({ label, value, onCommit }) {
  const [draft, setDraft] = useState(value ?? '');

  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted">{label}</span>
      <input
        type="number"
        min="0"
        step="1"
        value={draft}
        placeholder="0"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const num = draft === '' ? null : Number(draft);
          if (num === (value ?? null)) return;
          onCommit(num);
        }}
        className="w-full rounded-lg border border-border bg-ink px-2 py-1.5 text-sm outline-none focus:border-teal"
      />
    </label>
  );
}

export default function RoadmapCard({ action, onToggleComplete, onUpdateFinancials }) {
  const completed = Boolean(action.completed);
  const hasFinancials = action.cost != null || action.expected_benefit != null;

  return (
    <article
      className={`rounded-xl border p-5 transition ${
        completed ? 'border-teal/40 bg-teal/5' : 'border-border bg-surface hover:border-teal/40'
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber/15 font-mono text-xs font-semibold text-amber">
            {action.priority}
          </span>
          <h3
            className={`font-display text-base font-semibold ${
              completed ? 'text-muted line-through' : 'text-text'
            }`}
          >
            {action.title}
          </h3>
        </div>
        {onToggleComplete ? (
          <button
            type="button"
            onClick={() => onToggleComplete(!completed)}
            aria-pressed={completed}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
              completed
                ? 'border-teal/50 bg-teal/15 text-teal'
                : 'border-border text-muted hover:border-teal/40 hover:text-text'
            }`}
          >
            <Check size={12} /> {completed ? 'Done' : 'Mark done'}
          </button>
        ) : (
          <ArrowUpRight size={16} className="shrink-0 text-muted" />
        )}
      </div>

      <p className="mb-4 text-sm leading-relaxed text-muted">{action.description}</p>

      {Array.isArray(action.resources) && action.resources.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {action.resources.map((r) => (
            <a
              key={r.url}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-teal/40 bg-teal/10 px-3 py-1 text-xs font-medium text-teal transition hover:bg-teal/20"
            >
              {r.name} <ExternalLink size={11} />
            </a>
          ))}
        </div>
      )}

      <ActionGuide category={action.category} />

      {onUpdateFinancials ? (
        <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-border/60 bg-ink/30 p-3">
          <FinancialField
            label="Estimated cost (AUD)"
            value={action.cost}
            onCommit={(num) => onUpdateFinancials({ cost: num })}
          />
          <FinancialField
            label="Expected benefit (AUD)"
            value={action.expected_benefit}
            onCommit={(num) => onUpdateFinancials({ expected_benefit: num })}
          />
        </div>
      ) : (
        hasFinancials && (
          <div className="mb-4 flex items-center gap-4 rounded-lg border border-border/60 bg-ink/30 px-3 py-2 text-xs font-mono text-muted">
            <DollarSign size={12} className="text-teal" />
            {action.cost != null && <span>Cost: {formatAud(action.cost)}</span>}
            {action.expected_benefit != null && (
              <span>Expected benefit: {formatAud(action.expected_benefit)}</span>
            )}
          </div>
        )
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-muted">
        {action.category && (
          <span className="rounded-md border border-border px-2 py-1 text-teal">{action.category}</span>
        )}
        <span className="inline-flex items-center gap-1">
          <Clock3 size={12} /> {action.timeframe}
        </span>
        <VendorLink category={action.category} />
      </div>
    </article>
  );
}
