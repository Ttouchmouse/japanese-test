import { describe, expect, it } from "vitest";
import questionBankData from "../data/question-bank.json";
import type { QuestionBank } from "../types";
import { audioCueFor, audioCues } from "./audio";

const bank = questionBankData as QuestionBank;

describe("lesson 1–18 audio cues", () => {
  const lessons = bank.lessons.filter((lesson) => lesson.id <= 18);
  const lessonItems = lessons.flatMap((lesson) => lesson.items);
  const lessonItemIds = new Set(lessonItems.map((item) => item.id));

  it("maps every included item exactly once", () => {
    expect(audioCues).toHaveLength(lessonItems.length);
    expect(new Set(audioCues.map((cue) => cue.sourceItemId)).size).toBe(audioCues.length);
    expect(audioCues.every((cue) => lessonItemIds.has(cue.sourceItemId))).toBe(true);
    lessonItems.forEach((item) => expect(audioCueFor(item.id)).toBeDefined());
  });

  it("keeps valid, unique clip metadata", () => {
    expect(new Set(audioCues.map((cue) => cue.src)).size).toBe(audioCues.length);
    expect(audioCues.every((cue) => cue.start >= 0 && cue.end > cue.start)).toBe(true);
    expect(
      audioCues.every((cue) => /^\/audio\/lesson-(0[1-9]|1[0-8])\//.test(cue.src)),
    ).toBe(true);
  });
});
