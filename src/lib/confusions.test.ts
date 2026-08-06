import { describe, expect, it } from "vitest";
import type { QuestionBank } from "../types";
import { groupConfusedItems } from "./confusions";

const bank: QuestionBank = {
  version: 1,
  title: "test",
  lessons: [
    {
      id: 1,
      title: "one",
      speechLevel: "",
      startPage: 1,
      endPage: 1,
      items: [
        {
          id: "word-one",
          lessonId: 1,
          type: "vocabulary",
          japanese: "彼氏",
          korean: "남자 친구",
          reading: "かれし",
          sourcePage: 1,
        },
        {
          id: "pattern-one",
          lessonId: 1,
          type: "pattern",
          japanese: "彼氏?",
          korean: "남자 친구야?",
          sourcePage: 1,
        },
        {
          id: "conversation-one",
          lessonId: 1,
          type: "conversation",
          japanese: "彼氏?",
          korean: "남자 친구야?",
          sourcePage: 1,
        },
      ],
    },
  ],
};

describe("confusion groups", () => {
  it("merges identical expressions stored as different source items", () => {
    const groups = groupConfusedItems(bank, {
      "pattern-one": "2026-08-01T00:00:00.000Z",
      "conversation-one": "2026-08-02T00:00:00.000Z",
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].sourceItemIds).toEqual(["pattern-one", "conversation-one"]);
    expect(groups[0].types).toEqual(["pattern", "conversation"]);
    expect(groups[0].markedAt).toBe("2026-08-02T00:00:00.000Z");
  });

  it("keeps a vocabulary reading and sorts recently marked expressions first", () => {
    const groups = groupConfusedItems(bank, {
      "word-one": "2026-08-03T00:00:00.000Z",
      "pattern-one": "2026-08-01T00:00:00.000Z",
    });

    expect(groups[0].japanese).toBe("彼氏");
    expect(groups[0].reading).toBe("かれし");
    expect(groups[0].category).toBe("vocabulary");
  });
});
