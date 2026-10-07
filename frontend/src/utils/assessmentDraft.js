// Saves an in-progress assessment in this browser so a reload (or an accidental
// tab close) resumes where the person left off instead of starting again.
// Drafts are stored per user (and per client, for advisors), expire after a
// week, and are only restored if they still match the current question list.

const PREFIX = 'bt_draft:';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function loadDraft(key, questions) {
  if (!key) return [];
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return [];
    const { savedAt, answers } = JSON.parse(raw);
    if (!Array.isArray(answers) || Date.now() - savedAt > MAX_AGE_MS) {
      localStorage.removeItem(PREFIX + key);
      return [];
    }
    // Must be a strict prefix of today's questions, in order, and not already
    // complete. If an admin has since edited/changed the questions, start fresh.
    const valid =
      answers.length > 0 &&
      answers.length < questions.length &&
      answers.every(
        (a, i) => a && a.question_id === questions[i].id && (a.answer === 0 || a.answer === 1)
      );
    if (!valid) {
      localStorage.removeItem(PREFIX + key);
      return [];
    }
    return answers;
  } catch {
    return [];
  }
}

export function saveDraft(key, answers) {
  if (!key) return;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: Date.now(), answers }));
  } catch {
    // Storage full or blocked: the assessment still works, it just won't resume.
  }
}

export function clearDraft(key) {
  if (!key) return;
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}
