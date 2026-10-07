import { useState } from 'react';
import { ChevronDown, ListChecks } from 'lucide-react';
import { ACTION_GUIDES, GUIDE_DISCLAIMER } from '../data/actionGuides';

// Expandable "how to do this" checklist for a roadmap action. Ticks are local
// to the page (a convenience while working through it); progress that matters
// is recorded with "Mark done" on the action itself.
export default function ActionGuide({ category }) {
  const guide = ACTION_GUIDES[category];
  const [open, setOpen] = useState(false);
  const [ticked, setTicked] = useState({});
  if (!guide) return null;

  const doneCount = Object.values(ticked).filter(Boolean).length;

  return (
    <div className="mb-4 rounded-lg border border-border/60 bg-ink/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-text"
      >
        <span className="inline-flex items-center gap-1.5">
          <ListChecks size={13} className="text-teal" /> How to do this
          {doneCount > 0 && (
            <span className="font-mono text-[10px] text-muted">
              {doneCount}/{guide.steps.length}
            </span>
          )}
        </span>
        <ChevronDown size={14} className={`text-muted transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-border/60 px-3 py-3">
          <p className="mb-2 font-mono text-[11px] text-muted">{guide.time}</p>
          <ol className="space-y-1.5">
            {guide.steps.map((step, i) => (
              <li key={step}>
                <label className="flex cursor-pointer items-start gap-2 text-xs leading-relaxed text-muted">
                  <input
                    type="checkbox"
                    checked={Boolean(ticked[i])}
                    onChange={(e) => setTicked((t) => ({ ...t, [i]: e.target.checked }))}
                    className="mt-0.5 accent-teal"
                  />
                  <span className={ticked[i] ? 'line-through opacity-60' : ''}>{step}</span>
                </label>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[10px] text-muted/70">{GUIDE_DISCLAIMER}</p>
        </div>
      )}
    </div>
  );
}
