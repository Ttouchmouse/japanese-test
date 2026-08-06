import type { LearningProgress, QuizAnswers, QuizQuestion } from "../types";
import { isAnswerCorrect } from "./answer";

const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30];
const DAY_MS = 24 * 60 * 60 * 1000;

export function updateLearningProgress(
  current: LearningProgress,
  questions: QuizQuestion[],
  answers: QuizAnswers,
  reviewedAt = new Date(),
): LearningProgress {
  const next = { ...current };

  for (const question of questions) {
    const previous = current[question.sourceItemId];
    const isCorrect = isAnswerCorrect(question, answers[question.id]);
    const streak = isCorrect ? (previous?.streak ?? 0) + 1 : 0;
    const intervalDays = isCorrect
      ? REVIEW_INTERVAL_DAYS[Math.min(streak - 1, REVIEW_INTERVAL_DAYS.length - 1)]
      : 0;

    next[question.sourceItemId] = {
      sourceItemId: question.sourceItemId,
      attempts: (previous?.attempts ?? 0) + 1,
      correctAttempts: (previous?.correctAttempts ?? 0) + (isCorrect ? 1 : 0),
      streak,
      lastResult: isCorrect ? "correct" : "incorrect",
      lastReviewedAt: reviewedAt.toISOString(),
      dueAt: new Date(reviewedAt.getTime() + intervalDays * DAY_MS).toISOString(),
    };
  }

  return next;
}

export function progressPriority(
  sourceItemId: string,
  progress: LearningProgress,
  now = new Date(),
): number {
  const item = progress[sourceItemId];
  if (!item) return 0;

  const due = Date.parse(item.dueAt) <= now.getTime();
  const daysSinceReview = Math.max(
    0,
    Math.floor((now.getTime() - Date.parse(item.lastReviewedAt)) / DAY_MS),
  );

  if (item.lastResult === "incorrect") return 100 + Math.min(daysSinceReview, 30);
  if (due) return 50 + Math.min(daysSinceReview, 30);
  return 0;
}
