import type {
  ConfusionMarks,
  ExposureHistory,
  LearningProgress,
  QuizCategory,
  QuizCount,
  QuizCountOption,
  QuizMode,
  QuizSession,
} from "../types";
import { ITEM_ID_MIGRATIONS } from "./item-id-migrations";

const STORAGE_KEY = "nihongo-review-session-v5";
const PREVIOUS_STORAGE_KEYS = [
  "nihongo-review-session-v4",
  "nihongo-review-session-v3",
  "nihongo-review-session-v2",
  "nihongo-review-session-v1",
];
const MODE_STORAGE_KEY = "nihongo-review-mode-v2";
const LEGACY_MODE_STORAGE_KEY = "nihongo-review-mode-v1";
const CATEGORY_STORAGE_KEY = "nihongo-review-category-v1";
const QUESTION_COUNT_STORAGE_KEY = "nihongo-review-question-count-v2";
const LEGACY_QUESTION_COUNT_STORAGE_KEY = "nihongo-review-question-count-v1";
const PROGRESS_STORAGE_KEY = "nihongo-review-progress-v1";
const EXPOSURE_STORAGE_KEY = "nihongo-review-exposures-v1";
const CONFUSION_STORAGE_KEY = "nihongo-review-confusions-v1";

const QUIZ_COUNTS: QuizCount[] = [10, 20, 30, 100, 200];

export function loadSession(validSourceItemIds?: ReadonlySet<string>): QuizSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as QuizSession;
    const valid =
      stored.version === 5 &&
      Array.isArray(stored.selectedLessonIds) &&
      (stored.mode === "quick" || stored.mode === "write" || stored.mode === "recall") &&
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
          (question.answerKind === "choice" ||
            question.answerKind === "text" ||
            question.answerKind === "self") &&
          Array.isArray(question.options) &&
          (question.answerKind === "choice"
            ? question.options.length === 5
            : question.options.length === 0) &&
          (!validSourceItemIds || validSourceItemIds.has(question.sourceItemId)),
      ) &&
      Array.isArray(stored.confusedSourceItemIds) &&
      stored.confusedSourceItemIds.every((id) => typeof id === "string") &&
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
  PREVIOUS_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
}

export function clearSession(): void {
  window.localStorage.removeItem(STORAGE_KEY);
  PREVIOUS_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
}

export function loadMode(): QuizMode {
  const stored =
    window.localStorage.getItem(MODE_STORAGE_KEY) ??
    window.localStorage.getItem(LEGACY_MODE_STORAGE_KEY);
  return stored === "quick" || stored === "recall" ? stored : "write";
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

export function loadLearningProgress(
  validSourceItemIds?: ReadonlySet<string>,
): LearningProgress {
  try {
    const raw = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as LearningProgress;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return migrateLearningProgress(parsed, validSourceItemIds);
  } catch {
    return {};
  }
}

export function migrateLearningProgress(
  parsed: LearningProgress,
  validSourceItemIds?: ReadonlySet<string>,
): LearningProgress {
  if (!validSourceItemIds) return parsed;

  const migrated = Object.fromEntries(
    Object.entries(parsed).filter(([sourceItemId]) => validSourceItemIds.has(sourceItemId)),
  ) as LearningProgress;

  for (const [storedId, item] of Object.entries(parsed)) {
    const sourceItemId = ITEM_ID_MIGRATIONS[storedId];
    if (!sourceItemId || !validSourceItemIds.has(sourceItemId) || !item.confused) continue;
    const existing = migrated[sourceItemId];
    migrated[sourceItemId] = existing
      ? { ...existing, confused: true }
      : {
          sourceItemId,
          attempts: 0,
          correctAttempts: 0,
          streak: 0,
          confused: true,
          lastResult: "correct",
          lastReviewedAt: item.lastReviewedAt,
          dueAt: item.lastReviewedAt,
        };
  }

  return migrated;
}

export function saveLearningProgress(progress: LearningProgress): void {
  window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
}

export function loadExposureHistory(
  validSourceItemIds?: ReadonlySet<string>,
): ExposureHistory {
  try {
    const raw = window.localStorage.getItem(EXPOSURE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ExposureHistory;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([sourceItemId, shownAt]) =>
          (!validSourceItemIds || validSourceItemIds.has(sourceItemId)) &&
          typeof shownAt === "string" &&
          Number.isFinite(Date.parse(shownAt)),
      ),
    );
  } catch {
    return {};
  }
}

export function saveExposureHistory(history: ExposureHistory): void {
  window.localStorage.setItem(EXPOSURE_STORAGE_KEY, JSON.stringify(history));
}

export function migrateConfusionMarks(
  parsed: ConfusionMarks,
  validSourceItemIds?: ReadonlySet<string>,
): ConfusionMarks {
  const migrated: ConfusionMarks = {};
  for (const [storedId, markedAt] of Object.entries(parsed)) {
    const sourceItemId = ITEM_ID_MIGRATIONS[storedId] ?? storedId;
    if (validSourceItemIds && !validSourceItemIds.has(sourceItemId)) continue;
    const existing = migrated[sourceItemId];
    if (!existing || Date.parse(markedAt) > Date.parse(existing)) {
      migrated[sourceItemId] = markedAt;
    }
  }
  return migrated;
}

export function loadConfusionMarks(
  validSourceItemIds?: ReadonlySet<string>,
): ConfusionMarks {
  try {
    const raw = window.localStorage.getItem(CONFUSION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ConfusionMarks;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const validMarks = Object.fromEntries(
      Object.entries(parsed).filter(
        ([sourceItemId, markedAt]) =>
          sourceItemId.length > 0 &&
          typeof markedAt === "string" &&
          Number.isFinite(Date.parse(markedAt)),
      ),
    );
    return migrateConfusionMarks(validMarks, validSourceItemIds);
  } catch {
    return {};
  }
}

export function saveConfusionMarks(marks: ConfusionMarks): void {
  window.localStorage.setItem(CONFUSION_STORAGE_KEY, JSON.stringify(marks));
}
