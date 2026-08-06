import { describe, expect, it } from "vitest";
import type { QuizQuestion } from "../types";
import { RECALL_REMEMBERED } from "./answer";
import { progressPriority, updateLearningProgress } from "./progress";

const questions: QuizQuestion[] = [
  {
    id: "one-ja-ko",
    sourceItemId: "one",
    lessonId: 1,
    type: "vocabulary",
    direction: "ja-ko",
    prompt: "本",
    correctAnswer: "책",
    acceptedAnswers: ["책"],
    answerKind: "choice",
    options: ["책", "연필", "가방", "시계", "우산"],
    japanese: "本",
    korean: "책",
  },
  {
    id: "two-ko-ja",
    sourceItemId: "two",
    lessonId: 1,
    type: "vocabulary",
    direction: "ko-ja",
    prompt: "연필",
    correctAnswer: "鉛筆",
    acceptedAnswers: ["鉛筆"],
    answerKind: "choice",
    options: ["鉛筆", "本", "鞄", "時計", "傘"],
    japanese: "鉛筆",
    korean: "연필",
  },
];

describe("learning progress", () => {
  it("schedules correct items and makes incorrect items due immediately", () => {
    const reviewedAt = new Date("2026-08-01T00:00:00.000Z");
    const progress = updateLearningProgress(
      {},
      questions,
      { "one-ja-ko": "책", "two-ko-ja": "本" },
      [],
      reviewedAt,
    );

    expect(progress.one.streak).toBe(1);
    expect(progress.one.dueAt).toBe("2026-08-02T00:00:00.000Z");
    expect(progress.two.lastResult).toBe("incorrect");
    expect(progress.two.dueAt).toBe(reviewedAt.toISOString());
    expect(progressPriority("two", progress, reviewedAt)).toBeGreaterThan(
      progressPriority("one", progress, reviewedAt),
    );
  });

  it("extends the interval after another correct answer", () => {
    const firstDate = new Date("2026-08-01T00:00:00.000Z");
    const first = updateLearningProgress({}, [questions[0]], { "one-ja-ko": "책" }, [], firstDate);
    const secondDate = new Date("2026-08-02T00:00:00.000Z");
    const second = updateLearningProgress(first, [questions[0]], { "one-ja-ko": "책" }, [], secondDate);

    expect(second.one.streak).toBe(2);
    expect(second.one.dueAt).toBe("2026-08-05T00:00:00.000Z");
  });

  it("stores confusion separately from correctness and makes it due immediately", () => {
    const recallQuestions: QuizQuestion[] = [
      {
        id: "sentence-one-recall",
        sourceItemId: "sentence-one",
        lessonId: 1,
        type: "pattern",
        direction: "ko-ja",
        prompt: "여자 친구가 아니야?",
        correctAnswer: "彼女じゃない?",
        acceptedAnswers: ["彼女じゃない?"],
        answerKind: "self",
        options: [],
        japanese: "彼女じゃない?",
        korean: "여자 친구가 아니야?",
      },
      {
        id: "sentence-two-recall",
        sourceItemId: "sentence-two",
        lessonId: 1,
        type: "conversation",
        direction: "ko-ja",
        prompt: "응, 여자 친구야.",
        correctAnswer: "うん、彼女。",
        acceptedAnswers: ["うん、彼女。"],
        answerKind: "self",
        options: [],
        japanese: "うん、彼女。",
        korean: "응, 여자 친구야.",
      },
    ];
    const reviewedAt = new Date("2026-08-01T00:00:00.000Z");
    const progress = updateLearningProgress(
      {},
      recallQuestions,
      {
        "sentence-one-recall": RECALL_REMEMBERED,
        "sentence-two-recall": RECALL_REMEMBERED,
      },
      ["sentence-two"],
      reviewedAt,
    );

    expect(progress["sentence-one"].lastResult).toBe("correct");
    expect(progress["sentence-one"].confused).toBe(false);
    expect(progress["sentence-one"].dueAt).toBe("2026-08-02T00:00:00.000Z");
    expect(progress["sentence-two"].lastResult).toBe("correct");
    expect(progress["sentence-two"].confused).toBe(true);
    expect(progress["sentence-two"].streak).toBe(0);
    expect(progress["sentence-two"].dueAt).toBe(reviewedAt.toISOString());
    expect(progressPriority("sentence-two", progress, reviewedAt)).toBeGreaterThan(0);
  });
});
