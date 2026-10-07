import { useCallback, useEffect, useState } from 'react';
import { Share2, Copy, Check, Link2Off } from 'lucide-react';
import api from '../api/client';

// Create, copy and revoke read-only links to a business's latest report.
// A business shares its own; an advisor passes the client's id.
export default function ShareReport({ businessId }) {
  const [links, setLinks] = useState([]);
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/share', { params: businessId ? { business_id: businessId } : {} });
      setLinks(data.shares || []);
    } catch {
      setLinks([]);
    }
  }, [businessId]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    setError('');
    setCopied(false);
    try {
      const { data } = await api.post('/share', businessId ? { business_id: businessId } : {});
      setCreated(data);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create a link');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id) => {
    setError('');
    try {
      await api.delete(`/share/${id}`);
      if (created?.id === id) setCreated(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not revoke that link');
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(created.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be blocked; the link is selectable in the box.
    }
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h3 className="mb-1 flex items-center gap-1.5 font-display text-lg font-semibold">
        <Share2 size={16} className="text-teal" /> Share this report
      </h3>
      <p className="mb-4 text-xs text-muted">
        Make a read-only link for a bank, partner or accountant. It shows the business name, score, categories and
        roadmap — not the owner&apos;s name, email or any cost figures. Links expire after 14 days.
      </p>

      {error && (
        <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {created && (
        <div className="mb-4 rounded-lg border border-teal/30 bg-teal/5 p-3">
          <p className="mb-2 text-xs text-muted">
            Copy it now — for safety it can&apos;t be shown again. Expires {new Date(created.expires_at).toLocaleDateString()}.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={created.link}
              onFocus={(e) => e.target.select()}
              className="min-w-0 flex-1 rounded-lg border border-border bg-ink px-3 py-2 font-mono text-xs outline-none"
            />
            <button
              type="button"
              onClick={copy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-teal/40 bg-teal/10 px-3 py-2 text-xs text-teal transition hover:bg-teal/20"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={create}
        disabled={busy}
        className="rounded-xl bg-amber px-4 py-2 text-sm font-semibold text-ink transition hover:bg-amber/90 disabled:opacity-60"
      >
        {busy ? 'Creating…' : 'Create a share link'}
      </button>

      {links.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {links.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 text-xs text-muted">
              <span>
                Link made {new Date(l.created_at).toLocaleDateString()} · expires {new Date(l.expires_at).toLocaleDateString()}
              </span>
              <button
                type="button"
                onClick={() => revoke(l.id)}
                className="inline-flex items-center gap-1 text-red-300 underline hover:no-underline"
              >
                <Link2Off size={11} /> Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
