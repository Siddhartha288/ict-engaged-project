import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import QuestionCard from '../components/QuestionCard';

export default function Assessment() {
  const navigate = useNavigate();
  const [flatQuestions, setFlatQuestions] = useState([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        let res;
        try {
          res = await api.get('/questions');
        } catch (err) {
          // One quiet retry for a momentary outage (no response, or a proxy
          // 502/503/504 while the server restarts) before showing an error.
          const transient = !err.response || [502, 503, 504].includes(err.response.status);
          if (!transient) throw err;
          await new Promise((r) => setTimeout(r, 1200));
          res = await api.get('/questions');
        }
        const { data } = res;
        const flat = [];
        for (const cat of data.categories || []) {
          for (const q of cat.questions || []) {
            flat.push({
              id: q.id,
              text: q.text,
              categoryLabel: cat.label,
            });
          }
        }
        if (!cancelled) setFlatQuestions(flat);
      } catch (err) {
        if (!cancelled) {
          setError(
            err.response
              ? err.response.data?.message || 'Failed to load questions'
              : 'Couldn’t reach the server. Check your connection and try again.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const current = flatQuestions[index];
  const progressLabel = useMemo(
    () => ({ current: index + 1, total: flatQuestions.length }),
    [index, flatQuestions.length]
  );

  const finish = async (finalAnswers) => {
    setSubmitting(true);
    setError('');
    try {
      const { data } = await api.post('/assessments', { responses: finalAnswers });
      navigate(`/dashboard?assessment=${data.id}`, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit assessment');
      setSubmitting(false);
    }
  };

  const onAnswer = async (answer) => {
    if (!current || submitting) return;
    const nextAnswers = [...answers, { question_id: current.id, answer }];
    setAnswers(nextAnswers);

    if (index + 1 >= flatQuestions.length) {
      await finish(nextAnswers);
    } else {
      setIndex((i) => i + 1);
    }
  };

  if (loading) {
    return (
      <div className="px-4 py-20 text-center font-mono text-sm text-muted">Loading questions…</div>
    );
  }

  if (error && !current) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="mb-4 text-sm text-red-300">{error}</p>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="rounded-xl bg-amber px-4 py-2 text-sm font-semibold text-ink transition hover:bg-amber/90"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="mb-8 text-center">
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-teal">
          {flatQuestions.length} question{flatQuestions.length === 1 ? '' : 's'}
        </p>
        <h1 className="font-display text-3xl font-bold">Digital maturity assessment</h1>
        <p className="mt-2 text-sm text-muted">Answer Yes or No — about 3 minutes.</p>
      </div>

      {error && (
        <div className="mx-auto mb-4 max-w-xl rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {current && (
        <QuestionCard
          question={current.text}
          categoryLabel={current.categoryLabel}
          current={progressLabel.current}
          total={progressLabel.total}
          onAnswer={onAnswer}
          answering={submitting}
        />
      )}
    </div>
  );
}
