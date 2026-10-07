import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import QuestionCard from '../components/QuestionCard';
import { useAuth } from '../context/AuthContext';
import { loadDraft, saveDraft, clearDraft } from '../utils/assessmentDraft';

export default function AdvisorRunAssessment() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const draftKey = user ? `assessment:${user.id}:client:${id}` : null;
  const [resumed, setResumed] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [flatQuestions, setFlatQuestions] = useState([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [businessRes, questionsRes] = await Promise.all([
          api.get(`/admin/businesses/${id}`),
          api.get(`/admin/businesses/${id}/questions`),
        ]);
        if (cancelled) return;
        setBusinessName(businessRes.data.business_name || businessRes.data.name);
        const flat = [];
        for (const cat of questionsRes.data.categories || []) {
          for (const q of cat.questions || []) {
            flat.push({ id: q.id, text: q.text, categoryLabel: cat.label });
          }
        }
        setFlatQuestions(flat);
        // Pick up where a previous (interrupted) session with this client left off.
        const saved = loadDraft(draftKey, flat);
        setAnswers(saved);
        setIndex(saved.length);
        setResumed(saved.length > 0);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || 'Failed to load assessment');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, draftKey]);

  const current = flatQuestions[index];
  const progressLabel = useMemo(
    () => ({ current: index + 1, total: flatQuestions.length }),
    [index, flatQuestions.length]
  );

  const finish = async (finalAnswers) => {
    setSubmitting(true);
    setError('');
    try {
      const { data } = await api.post(`/admin/businesses/${id}/assessments`, {
        responses: finalAnswers,
      });
      clearDraft(draftKey);
      navigate(`/advisor/businesses/${id}?assessment=${data.id}`, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit assessment');
      setSubmitting(false);
    }
  };

  const onAnswer = async (answer) => {
    if (!current || submitting) return;
    // Rebuild from the answers before this question, so retrying after a
    // failed submit replaces the last answer instead of adding a duplicate.
    const nextAnswers = [...answers.slice(0, index), { question_id: current.id, answer }];
    setAnswers(nextAnswers);

    if (index + 1 >= flatQuestions.length) {
      await finish(nextAnswers);
    } else {
      saveDraft(draftKey, nextAnswers);
      setIndex((i) => i + 1);
    }
  };

  const startOver = () => {
    clearDraft(draftKey);
    setAnswers([]);
    setIndex(0);
    setResumed(false);
  };

  if (loading) {
    return (
      <div className="px-4 py-20 text-center font-mono text-sm text-muted">Loading assessment…</div>
    );
  }

  if (error && !current) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center text-sm text-red-300">{error}</div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="mb-8 text-center">
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-teal">
          Running assessment for {businessName} · {flatQuestions.length} question
          {flatQuestions.length === 1 ? '' : 's'}
        </p>
        <h1 className="font-display text-3xl font-bold">Digital maturity assessment</h1>
        <p className="mt-2 text-sm text-muted">Answer on the client&apos;s behalf — Yes or No.</p>
      </div>

      {error && (
        <div className="mx-auto mb-4 max-w-xl rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {resumed && !submitting && (
        <div className="mx-auto mb-4 flex max-w-xl items-center justify-between gap-3 rounded-lg border border-teal/30 bg-teal/10 px-3 py-2 text-sm text-teal">
          <span>Welcome back — resuming from question {progressLabel.current}.</span>
          <button type="button" onClick={startOver} className="shrink-0 underline hover:no-underline">
            Start over
          </button>
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
