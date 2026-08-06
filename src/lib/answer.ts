import type { QuizQuestion } from "../types";

export const RECALL_REMEMBERED = "remembered";

export function normalizeTypedAnswer(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s、。！？!?・･~〜～'’‘“”"「」『』（）()［\]【】]/gu, "");
}

export function isAnswerCorrect(question: QuizQuestion, answer: string | undefined): boolean {
  if (answer === undefined) return false;
  if (question.answerKind === "choice") return answer === question.correctAnswer;
  if (question.answerKind === "self") return answer === RECALL_REMEMBERED;
  const normalizedAnswer = normalizeTypedAnswer(answer);
  return question.acceptedAnswers.some(
    (acceptedAnswer) => normalizeTypedAnswer(acceptedAnswer) === normalizedAnswer,
  );
}
