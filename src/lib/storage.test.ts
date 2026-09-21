import { describe, expect, it, vi } from "vitest";
import questionBankData from "../data/question-bank.json";
import type { QuestionBank } from "../types";
import { ITEM_ID_MIGRATIONS } from "./item-id-migrations";
import { loadSession, migrateConfusionMarks, migrateLearningProgress } from "./storage";
import { generateQuiz } from "./quiz";

const bank = questionBankData as QuestionBank;

it("rejects stale textbook sessions without clearing separately saved learning records", () => {
  const questions = generateQuiz(bank, [34], Math.random, {}, new Date(), 8, "write", "vocabulary");
  const data = new Map<string, string>();
  const session = { version: 5, selectedLessonIds: [34], mode: "write", category: "vocabulary",
    countOption: 10, questionCount: questions.length, questions, answers: {},
    confusedSourceItemIds: [], currentIndex: 0, status: "quiz", startedAt: new Date().toISOString() };
  data.set("nihongo-review-session-v5", JSON.stringify(session));
  data.set("nihongo-review-confusions-v1", "keep");
  vi.stubGlobal("window", { localStorage: { getItem: (key: string) => data.get(key) ?? null,
    removeItem: (key: string) => data.delete(key) } });
  try {
    const current = new Map(bank.lessons.flatMap((lesson) => lesson.items.map((item) => [item.id, item] as const)));
    expect(loadSession(new Set(current.keys()), current)).not.toBeNull();
    session.questions[0].korean = "병원 姉[";
    data.set("nihongo-review-session-v5", JSON.stringify(session));
    expect(loadSession(new Set(current.keys()), current)).toBeNull();
    expect(data.get("nihongo-review-confusions-v1")).toBe("keep");
  } finally {
    vi.unstubAllGlobals();
  }
});

describe("stored confusion migration", () => {
  it("maps every repaired id to an item in the current bank", () => {
    const currentIds = new Set(
      bank.lessons.flatMap((lesson) => lesson.items.map((item) => item.id)),
    );

    for (const [previousId, currentId] of Object.entries(ITEM_ID_MIGRATIONS)) {
      expect(currentIds.has(previousId), previousId).toBe(false);
      expect(currentIds.has(currentId), currentId).toBe(true);
    }
  });

  it("moves a repaired item mark to its current source id", () => {
    const currentId = "l13-p-b4c6ff750bed";
    const result = migrateConfusionMarks(
      { "l13-p-abf587c0a1ff": "2026-08-01T00:00:00.000Z" },
      new Set([currentId]),
    );

    expect(result).toEqual({ [currentId]: "2026-08-01T00:00:00.000Z" });
  });

  it("keeps the newest mark and removes ids absent from the current bank", () => {
    const currentId = "l12-p-fac4bb66491d";
    const result = migrateConfusionMarks(
      {
        "l12-p-2d808a5b32a1": "2026-08-01T00:00:00.000Z",
        [currentId]: "2026-08-03T00:00:00.000Z",
        removed: "2026-08-04T00:00:00.000Z",
      },
      new Set([currentId]),
    );

    expect(result).toEqual({ [currentId]: "2026-08-03T00:00:00.000Z" });
  });

  it("resets repaired learning scores while retaining an embedded confusion flag", () => {
    const currentId = "l13-p-b4c6ff750bed";
    const result = migrateLearningProgress(
      {
        "l13-p-abf587c0a1ff": {
          sourceItemId: "l13-p-abf587c0a1ff",
          attempts: 4,
          correctAttempts: 3,
          streak: 2,
          confused: true,
          lastResult: "correct",
          lastReviewedAt: "2026-08-01T00:00:00.000Z",
          dueAt: "2026-08-04T00:00:00.000Z",
        },
      },
      new Set([currentId]),
    );

    expect(result[currentId]).toMatchObject({
      sourceItemId: currentId,
      attempts: 0,
      correctAttempts: 0,
      streak: 0,
      confused: true,
      dueAt: "2026-08-01T00:00:00.000Z",
    });
  });
});
