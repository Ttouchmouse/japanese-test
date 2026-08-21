import { describe, expect, it } from "vitest";
import questionBankData from "../data/question-bank.json";
import type { QuestionBank } from "../types";
import { ITEM_ID_MIGRATIONS } from "./item-id-migrations";
import { migrateConfusionMarks, migrateLearningProgress } from "./storage";

const bank = questionBankData as QuestionBank;

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
