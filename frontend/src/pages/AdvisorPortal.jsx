import { Fragment, useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, MessageSquare, Send } from 'lucide-react';
import api from '../api/client';

export default function AdvisorPortal() {
  const [businesses, setBusinesses] = useState([]);
  const [sortAsc, setSortAsc] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [expandedId, setExpandedId] = useState(null);
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/admin/businesses');
        if (!cancelled) setBusinesses(data.businesses || []);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || 'Failed to load businesses');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sorted = useMemo(() => {
    const copy = [...businesses];
    copy.sort((a, b) => {
      const sa = a.latest_assessment?.score;
      const sb = b.latest_assessment?.score;
      if (sa == null && sb == null) return a.name.localeCompare(b.name);
      if (sa == null) return 1;
      if (sb == null) return -1;
      return sortAsc ? sa - sb : sb - sa;
    });
    return copy;
  }, [businesses, sortAsc]);

  const loadNotes = async (businessId) => {
    setNotesLoading(true);
    try {
      const { data } = await api.get(`/notes/${businessId}`);
      setNotes(data.notes || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load notes');
    } finally {
      setNotesLoading(false);
    }
  };

  const toggleExpand = (businessId) => {
    if (expandedId === businessId) {
      setExpandedId(null);
      setNotes([]);
      setDraft('');
      return;
    }
    setExpandedId(businessId);
    setDraft('');
    loadNotes(businessId);
  };

  const submitNote = async (businessId) => {
    const content = draft.trim();
    if (!content) return;
    setPosting(true);
    setError('');
    try {
      await api.post(`/notes/${businessId}`, { content });
      setDraft('');
      await loadNotes(businessId);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to post note');
    } finally {
      setPosting(false);
    }
  };

  if (loading) {
    return <div className="px-4 py-20 text-center font-mono text-sm text-muted">Loading businesses…</div>;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-teal">Advisor portal</p>
          <h1 className="font-display text-3xl font-bold">Business overview</h1>
        </div>
        <button
          type="button"
          onClick={() => setSortAsc((v) => !v)}
          className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-muted transition hover:border-teal/40 hover:text-text"
        >
          <ArrowDownUp size={14} />
          Score {sortAsc ? '↑ low to high' : '↓ high to low'}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-ink/40 font-mono text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Business</th>
                <th className="px-4 py-3 font-medium">Sector</th>
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Level</th>
                <th className="px-4 py-3 font-medium">Assessed</th>
                <th className="px-4 py-3 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted">
                    No business accounts yet.
                  </td>
                </tr>
              )}
              {sorted.map((b) => (
                <Fragment key={b.id}>
                  <tr className="border-b border-border/60 last:border-0 hover:bg-ink/30">
                    <td className="px-4 py-3 font-medium text-text">
                      {b.business_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-muted">{b.sector_label || '—'}</td>
                    <td className="px-4 py-3 text-muted">{b.name}</td>
                    <td className="px-4 py-3 text-muted">{b.email}</td>
                    <td className="px-4 py-3 font-mono text-amber">
                      {b.latest_assessment ? `${b.latest_assessment.score}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-teal">
                      {b.latest_assessment?.level || 'Not assessed'}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">
                      {b.latest_assessment
                        ? new Date(b.latest_assessment.date).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => toggleExpand(b.id)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition ${
                          expandedId === b.id
                            ? 'border-teal/50 bg-teal/15 text-teal'
                            : 'border-border text-muted hover:border-teal/40 hover:text-text'
                        }`}
                      >
                        <MessageSquare size={12} /> Notes
                      </button>
                    </td>
                  </tr>
                  {expandedId === b.id && (
                    <tr className="border-b border-border/60 bg-ink/20 last:border-0">
                      <td colSpan={8} className="px-4 py-4">
                        <div className="mx-auto max-w-2xl">
                          {notesLoading ? (
                            <p className="text-xs text-muted">Loading notes…</p>
                          ) : (
                            <div className="mb-3 space-y-2">
                              {notes.length === 0 ? (
                                <p className="text-xs text-muted">No notes yet for {b.business_name || b.name}.</p>
                              ) : (
                                notes.map((n) => (
                                  <div key={n.id} className="rounded-lg border border-border bg-surface p-3">
                                    <p className="text-sm text-text">{n.content}</p>
                                    <p className="mt-1 font-mono text-[11px] text-muted">
                                      {n.advisor_name} · {new Date(n.created_at).toLocaleDateString()}
                                    </p>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                          <div className="flex gap-2">
                            <input
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              placeholder="Add a note for this business…"
                              maxLength={2000}
                              className="flex-1 rounded-lg border border-border bg-ink px-3 py-2 text-sm outline-none focus:border-teal"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') submitNote(b.id);
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => submitNote(b.id)}
                              disabled={posting || !draft.trim()}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-teal px-3 py-2 text-xs font-semibold text-ink transition hover:bg-teal/90 disabled:opacity-60"
                            >
                              <Send size={12} /> Send
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
