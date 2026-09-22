import type { QuizSession } from "../types";

/** Undo only a submitted answer in an ongoing quiz, not a completed result. */
export function undoCurrentAnswer(session: QuizSession | null): QuizSession | null {
  if (!session || session.status !== "quiz") return session;
  const question = session.questions[session.currentIndex];
  if (!question || session.answers[question.id] === undefined) return session;
  const answers = { ...session.answers };
  delete answers[question.id];
  return { ...session, answers };
}
