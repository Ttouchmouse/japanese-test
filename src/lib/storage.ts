import type {
  LearningProgress,
  QuizCategory,
  QuizCount,
  QuizCountOption,
  QuizMode,
  QuizSession,
} from "../types";

const STORAGE_KEY = "nihongo-review-session-v3";
const PREVIOUS_STORAGE_KEY = "nihongo-review-session-v2";
const LEGACY_STORAGE_KEY = "nihongo-review-session-v1";
const MODE_STORAGE_KEY = "nihongo-review-mode-v2";
const LEGACY_MODE_STORAGE_KEY = "nihongo-review-mode-v1";
const CATEGORY_STORAGE_KEY = "nihongo-review-category-v1";
const QUESTION_COUNT_STORAGE_KEY = "nihongo-review-question-count-v2";
const LEGACY_QUESTION_COUNT_STORAGE_KEY = "nihongo-review-question-count-v1";
const PROGRESS_STORAGE_KEY = "nihongo-review-progress-v1";

const QUIZ_COUNTS: QuizCount[] = [10, 20, 30];

export function loadSession(): QuizSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as QuizSession;
    const valid =
      stored.version === 3 &&
      Array.isArray(stored.selectedLessonIds) &&
      (stored.mode === "quick" || stored.mode === "write") &&
      (stored.category === "all" || stored.category === "vocabulary" || stored.category === "sentence") &&
      (stored.countOption === "all" || QUIZ_COUNTS.includes(stored.countOption)) &&
      Number.isInteger(stored.questionCount) &&
      stored.questionCount > 0 &&
      Array.isArray(stored.questions) &&
      stored.questions.length === stored.questionCount &&
      stored.questions.every(
        (question) =>
          typeof question.id === "string" &&
          typeof question.correctAnswer === "string" &&
          Array.isArray(question.acceptedAnswers) &&
          question.acceptedAnswers.length > 0 &&
          (question.answerKind === "choice" || question.answerKind === "text") &&
          Array.isArray(question.options) &&
          (question.answerKind === "choice"
            ? question.options.length === 5
            : question.options.length === 0),
      ) &&
      (stored.status === "quiz" || stored.status === "result");
    if (!valid) throw new Error("Invalid session");
    return stored;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function saveSession(session: QuizSession): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  window.localStorage.removeItem(PREVIOUS_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
}

export function clearSession(): void {
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(PREVIOUS_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
}

export function loadMode(): QuizMode {
  const stored =
    window.localStorage.getItem(MODE_STORAGE_KEY) ??
    window.localStorage.getItem(LEGACY_MODE_STORAGE_KEY);
  return stored === "quick" ? "quick" : "write";
}

export function saveMode(mode: QuizMode): void {
  window.localStorage.setItem(MODE_STORAGE_KEY, mode);
}

export function loadCategory(): QuizCategory {
  const stored = window.localStorage.getItem(CATEGORY_STORAGE_KEY);
  return stored === "vocabulary" || stored === "sentence" ? stored : "all";
}

export function saveCategory(category: QuizCategory): void {
  window.localStorage.setItem(CATEGORY_STORAGE_KEY, category);
}

export function loadQuestionCount(): QuizCountOption {
  const raw =
    window.localStorage.getItem(QUESTION_COUNT_STORAGE_KEY) ??
    window.localStorage.getItem(LEGACY_QUESTION_COUNT_STORAGE_KEY);
  if (raw === "all") return "all";
  const stored = Number(raw);
  return QUIZ_COUNTS.includes(stored as QuizCount) ? (stored as QuizCount) : 20;
}

export function saveQuestionCount(count: QuizCountOption): void {
  window.localStorage.setItem(QUESTION_COUNT_STORAGE_KEY, String(count));
}

export function loadLearningProgress(): LearningProgress {
  try {
    const raw = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as LearningProgress;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

export function saveLearningProgress(progress: LearningProgress): void {
  window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
}
