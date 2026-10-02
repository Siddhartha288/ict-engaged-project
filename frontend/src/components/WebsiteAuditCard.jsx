import { useState } from 'react';
import { Globe, RefreshCw, CheckCircle2, XCircle, HelpCircle, Clock3 } from 'lucide-react';

function CheckRow({ label, value }) {
  let Icon = HelpCircle;
  let color = 'text-muted';
  if (value === true) {
    Icon = CheckCircle2;
    color = 'text-teal';
  } else if (value === false) {
    Icon = XCircle;
    color = 'text-red-300';
  }
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon size={14} className={color} />
      <span className="text-text">{label}</span>
    </div>
  );
}

export default function WebsiteAuditCard({ audit, onRun, running }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const editable = Boolean(onRun);

  const submit = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    setError('');
    try {
      await onRun(url.trim());
      setUrl('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to run audit');
    }
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h3 className="mb-1 flex items-center gap-1.5 font-display text-lg font-semibold">
        <Globe size={16} className="text-teal" /> Website audit
      </h3>
      <p className="mb-4 text-xs text-muted">
        Automated checks against the business&apos;s public website — no self-reporting involved.
      </p>

      {editable && (
        <form onSubmit={submit} className="mb-4 flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="yourbusiness.com"
            className="flex-1 rounded-lg border border-border bg-ink px-3 py-2 text-sm outline-none focus:border-teal"
          />
          <button
            type="submit"
            disabled={running || !url.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal px-3 py-2 text-xs font-semibold text-ink transition hover:bg-teal/90 disabled:opacity-60"
          >
            {running ? <RefreshCw size={12} className="animate-spin" /> : <Globe size={12} />}
            {running ? 'Checking…' : audit ? 'Re-run' : 'Run audit'}
          </button>
        </form>
      )}

      {error && (
        <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {!audit && !editable && <p className="text-xs text-muted">No website audit has been run yet.</p>}
      {!audit && editable && (
        <p className="text-xs text-muted">Enter your website above to run a free automated check.</p>
      )}

      {audit && (
        <div>
          <p className="mb-3 truncate text-xs text-muted">
            {audit.url} · {new Date(audit.created_at).toLocaleString()}
          </p>

          {audit.status === 'unreachable' ? (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {audit.error_message || 'Could not reach that website.'}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                <CheckRow label="HTTPS" value={audit.https} />
                <CheckRow label="Mobile-friendly" value={audit.mobile_friendly} />
                <CheckRow label="Page title" value={audit.has_title} />
                <CheckRow label="Meta description" value={audit.has_meta_description} />
                <CheckRow label="Online payment detected" value={audit.payment_detected} />
                <CheckRow
                  label={
                    audit.social_links_found?.length
                      ? `Social: ${audit.social_links_found.join(', ')}`
                      : 'Social links'
                  }
                  value={audit.social_links_found?.length > 0}
                />
              </div>
              {audit.response_time_ms != null && (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
                  <Clock3 size={12} /> Responded in {audit.response_time_ms}ms
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
