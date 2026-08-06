import { describe, expect, it } from "vitest";
import questionBankData from "../data/question-bank.json";
import type { LearningProgress, QuestionBank, QuizCount, StudyItem } from "../types";
import { isAnswerCorrect } from "./answer";
import {
  availableQuestionCount,
  generateQuiz,
  scoreQuiz,
  selectDistractorAnswers,
} from "./quiz";

const bank = questionBankData as QuestionBank;

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

describe("generateQuiz", () => {
  it("creates valid 10- and 20-question quizzes from every individual lesson", () => {
    for (const lesson of bank.lessons) {
      for (const count of [10, 20] as QuizCount[]) {
        const questions = generateQuiz(
          bank,
          [lesson.id],
          seededRandom(lesson.id + count),
          {},
          new Date(0),
          count,
        );
        expect(questions, `${lesson.id}과 ${count}문제`).toHaveLength(count);
        expect(
          new Set(questions.map((question) => question.sourceItemId)).size,
          `${lesson.id}과 ${count}문제 중복`,
        ).toBe(count);

        for (const question of questions) {
          expect(question.options, `${lesson.id}과 선택지 수`).toHaveLength(5);
          expect(new Set(question.options).size, `${lesson.id}과 선택지 중복`).toBe(5);
          expect(question.options).toContain(question.correctAnswer);
        }
      }
    }
  });

  it("keeps the preferred 40/40/20 mix for every selectable question count", () => {
    const expected = { 10: [4, 4, 2], 20: [8, 8, 4], 30: [12, 12, 6] } as const;
    for (const count of [10, 20, 30] as QuizCount[]) {
      const questions = generateQuiz(
        bank,
        bank.lessons.map((lesson) => lesson.id),
        seededRandom(42 + count),
        {},
        new Date(0),
        count,
      );
      expect(questions.filter((question) => question.type === "vocabulary")).toHaveLength(expected[count][0]);
      expect(questions.filter((question) => question.type === "pattern")).toHaveLength(expected[count][1]);
      expect(questions.filter((question) => question.type === "conversation")).toHaveLength(expected[count][2]);
    }
  });

  it("never repeats the same bilingual source pair across selected lessons", () => {
    const questions = generateQuiz(bank, bank.lessons.map((lesson) => lesson.id), seededRandom(7));
    const pairs = questions.map((question) => `${question.japanese}|${question.korean}`);
    expect(new Set(pairs).size).toBe(20);
  });

  it("reports the unique capacity of the selected lesson range", () => {
    expect(availableQuestionCount(bank, [58])).toBe(26);
    expect(availableQuestionCount(bank, [1, 58])).toBeGreaterThan(30);
  });

  it("creates Korean-to-Japanese text questions from every vocabulary item", () => {
    expect(availableQuestionCount(bank, [1], "write", "vocabulary")).toBe(8);
    expect(availableQuestionCount(bank, bank.lessons.slice(0, 10).map((lesson) => lesson.id), "write", "vocabulary")).toBe(94);

    const questions = generateQuiz(
      bank,
      [1],
      seededRandom(1),
      {},
      new Date(0),
      8,
      "write",
      "vocabulary",
    );

    expect(questions).toHaveLength(8);
    expect(questions.every((question) => question.answerKind === "text")).toBe(true);
    expect(questions.every((question) => question.direction === "ko-ja")).toBe(true);
    expect(questions.every((question) => question.options.length === 0)).toBe(true);
  });

  it("accepts both kanji and its saved hiragana reading", () => {
    const question = generateQuiz(
      bank,
      [2],
      seededRandom(2),
      {},
      new Date(0),
      8,
      "write",
      "vocabulary",
    ).find((item) => item.japanese === "先生")!;

    expect(isAnswerCorrect(question, "先生")).toBe(true);
    expect(isAnswerCorrect(question, " せんせい ")).toBe(true);
    expect(isAnswerCorrect(question, "せんせ")).toBe(false);
  });

  it("filters quick review to words or sentences", () => {
    const vocabulary = generateQuiz(bank, [1, 2], seededRandom(20), {}, new Date(0), 10, "quick", "vocabulary");
    const sentences = generateQuiz(bank, [1], seededRandom(21), {}, new Date(0), 10, "quick", "sentence");

    expect(vocabulary.every((question) => question.type === "vocabulary")).toBe(true);
    expect(sentences.every((question) => question.type !== "vocabulary")).toBe(true);
  });

  it("prefers plausible distractors from the same lesson", () => {
    const lesson = bank.lessons.find((item) => item.id === 4)!;
    const source = lesson.items.find((item) => item.type === "pattern")!;
    const pool = bank.lessons.flatMap((item) => item.items).filter(
      (item) => item.type === source.type,
    );
    const sameLessonAnswers = new Set(
      lesson.items
        .filter((item) => item.type === source.type && item.id !== source.id)
        .map((item) => item.korean),
    );
    const distractors = selectDistractorAnswers(source, "ja-ko", pool, seededRandom(4));

    expect(distractors).toHaveLength(4);
    expect(distractors.filter((answer) => sameLessonAnswers.has(answer)).length).toBeGreaterThanOrEqual(3);
  });

  it("includes incorrect or due items in the preferred part of each type pool", () => {
    const lesson = bank.lessons[0];
    const preferred = (["vocabulary", "pattern", "conversation"] as const).map(
      (type) => lesson.items.find((item) => item.type === type) as StudyItem,
    );
    const reviewedAt = "2026-07-01T00:00:00.000Z";
    const progress = Object.fromEntries(
      preferred.map((item) => [
        item.id,
        {
          sourceItemId: item.id,
          attempts: 1,
          correctAttempts: 0,
          streak: 0,
          lastResult: "incorrect" as const,
          lastReviewedAt: reviewedAt,
          dueAt: reviewedAt,
        },
      ]),
    ) satisfies LearningProgress;

    const questions = generateQuiz(
      bank,
      bank.lessons.map((item) => item.id),
      seededRandom(84),
      progress,
      new Date("2026-08-01T00:00:00.000Z"),
    );

    const selectedIds = new Set(questions.map((question) => question.sourceItemId));
    preferred.forEach((item) => expect(selectedIds).toContain(item.id));
  });
});

describe("scoreQuiz", () => {
  it("scores only exact selected answers", () => {
    const questions = generateQuiz(bank, [1], seededRandom(1));
    const answers = Object.fromEntries(
      questions.map((question, index) => [question.id, index < 12 ? question.correctAnswer : "오답"]),
    );
    expect(scoreQuiz(questions, answers)).toBe(12);
  });
});
