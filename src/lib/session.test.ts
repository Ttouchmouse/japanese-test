import { describe, expect, it } from "vitest";
import type { QuizQuestion, QuizSession } from "../types";
import { undoCurrentAnswer } from "./session";
import { updateLearningProgress } from "./progress";

function fixture(answerKind: QuizQuestion["answerKind"]): QuizSession {
  const question: QuizQuestion = {
    id: "question-1", sourceItemId: "item-1", lessonId: 1, type: "vocabulary",
    direction: "ko-ja", prompt: "학생", correctAnswer: "学生",
    acceptedAnswers: ["学生", "がくせい"], answerKind,
    options: answerKind === "choice" ? ["学生", "会社員", "彼氏", "彼女", "歌手"] : [],
    japanese: "学生", korean: "학생", reading: "がくせい",
  };
  return {
    version: 5, selectedLessonIds: [1], mode: answerKind === "choice" ? "quick" : answerKind === "text" ? "write" : "recall",
    category: "all", countOption: "all", questionCount: 2,
    questions: [question, { ...question, id: "question-2", sourceItemId: "item-2" }],
    answers: { "question-1": "wrong", "question-2": "学生" },
    confusedSourceItemIds: ["item-1"], currentIndex: 0, status: "quiz", startedAt: "2026-09-22T00:00:00Z",
  };
}

describe("undo current answer", () => {
  it.each(["text", "self", "choice"] as const)("reopens only the current %s question without changing other state", (kind) => {
    const original = fixture(kind);
    const next = undoCurrentAnswer(original)!;
    expect(next.answers).toEqual({ "question-2": "学生" });
    expect(original.answers["question-1"]).toBe("wrong");
    expect(next.questions).toBe(original.questions);
    expect(next.currentIndex).toBe(original.currentIndex);
    expect(next.confusedSourceItemIds).toBe(original.confusedSourceItemIds);
    expect(JSON.parse(JSON.stringify(next)).answers["question-1"]).toBeUndefined();
  });

  it("is safe for missing sessions, unanswered questions and completed results", () => {
    expect(undoCurrentAnswer(null)).toBeNull();
    const answered = fixture("text");
    const undone = undoCurrentAnswer(answered)!;
    expect(undoCurrentAnswer(undone)).toBe(undone);
    const result = { ...answered, status: "result" as const };
    expect(undoCurrentAnswer(result)).toBe(result);
  });

  it("records only the final resubmitted answer once when finishing", () => {
    const session = undoCurrentAnswer(fixture("text"))!;
    session.answers["question-1"] = "がくせい";
    const progress = updateLearningProgress({}, session.questions, session.answers, session.confusedSourceItemIds);
    expect(progress["item-1"]).toMatchObject({ attempts: 1, correctAttempts: 1, lastResult: "correct", confused: true });
  });
});
