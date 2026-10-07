import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, X } from 'lucide-react';
import api from '../api/client';

// In-app nudge for a business that has gone quiet or has a roadmap going stale.
export default function ReminderBanner() {
  const [reminders, setReminders] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/reminders')
      .then(({ data }) => {
        if (!cancelled) setReminders(data);
      })
      .catch(() => {
        // A missing reminder should never get in the way of the dashboard.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!reminders || dismissed) return null;
  const { reassess, actions } = reminders;
  if (!reassess?.due && !actions) return null;

  return (
    <div className="mb-6 flex items-start justify-between gap-3 rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-sm">
      <div className="flex gap-2.5">
        <BellRing size={16} className="mt-0.5 shrink-0 text-amber" />
        <div className="space-y-1 text-text">
          {reassess?.due && (
            <p>
              It has been {reassess.days_since} days since your last assessment.{' '}
              <Link to="/assessment" className="text-amber underline hover:no-underline">
                Retake it
              </Link>{' '}
              to see which of your actions moved the score.
            </p>
          )}
          {actions && (
            <p className="text-muted">
              {actions.open_count} roadmap action{actions.open_count === 1 ? ' is' : 's are'} still open from a plan made{' '}
              {actions.roadmap_age_days} days ago. Pick one and finish it this week.
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss reminder"
        className="shrink-0 text-muted transition hover:text-text"
      >
        <X size={14} />
      </button>
    </div>
  );
}
