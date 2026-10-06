import { useState } from 'react';
import { Search, ExternalLink } from 'lucide-react';
import { VENDOR_CATEGORIES, buildVendorSearchUrl } from '../utils/vendorFinder';

export default function VendorFinder() {
  const [query, setQuery] = useState('');
  const [activeTip, setActiveTip] = useState(null);

  const search = (q) => {
    if (!q.trim()) return;
    window.open(buildVendorSearchUrl(q), '_blank', 'noopener,noreferrer');
  };

  const selectCategory = (cat) => {
    setQuery(cat.query);
    setActiveTip(cat);
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-4">
        <h3 className="font-display text-lg font-semibold">Find tools & vendors</h3>
        <p className="mt-1 text-xs text-muted">
          Opens real, live search results — this never invents vendors or prices.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          search(query);
        }}
        className="flex gap-2"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. business wifi plans, point of sale system..."
          className="w-full flex-1 rounded-xl border border-border bg-ink px-3 py-2.5 text-sm outline-none focus:border-amber"
        />
        <button
          type="submit"
          className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-amber px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-amber/90"
        >
          <Search size={14} /> Search
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        {VENDOR_CATEGORIES.map((cat) => (
          <button
            key={cat.label}
            type="button"
            onClick={() => selectCategory(cat)}
            className={`rounded-full border px-3 py-1.5 font-mono text-xs transition ${
              activeTip?.label === cat.label
                ? 'border-teal text-teal'
                : 'border-border text-muted hover:text-text'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {activeTip && (
        <p className="mt-3 rounded-lg border border-border bg-ink/50 p-3 text-xs leading-relaxed text-muted">
          <span className="text-teal">What to look for:</span> {activeTip.tip}
        </p>
      )}
    </div>
  );
}

export function VendorLink({ category }) {
  if (!category) return null;
  return (
    <button
      type="button"
      onClick={() =>
        window.open(
          buildVendorSearchUrl(
            VENDOR_CATEGORIES.find((c) => c.label === category)?.query || `${category} tools for small business`
          ),
          '_blank',
          'noopener,noreferrer'
        )
      }
      className="inline-flex items-center gap-1 font-mono text-xs text-teal transition hover:text-teal/80"
    >
      Find vendors <ExternalLink size={11} />
    </button>
  );
}
