import type {
  ConfusionMarks,
  QuestionBank,
  QuestionType,
  StudyItem,
} from "../types";

export interface ConfusionGroup {
  key: string;
  japanese: string;
  korean: string;
  reading?: string;
  lessonIds: number[];
  types: QuestionType[];
  sourceItemIds: string[];
  markedAt: string;
  category: "vocabulary" | "sentence";
}

function normalizeExpression(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

export function confusionGroupKey(item: StudyItem): string {
  return `${normalizeExpression(item.japanese)}\u0000${normalizeExpression(item.korean)}`;
}

export function groupConfusedItems(
  bank: QuestionBank,
  marks: ConfusionMarks,
): ConfusionGroup[] {
  const groups = new Map<
    string,
    Omit<ConfusionGroup, "lessonIds" | "types" | "sourceItemIds"> & {
      lessonIds: Set<number>;
      types: Set<QuestionType>;
      sourceItemIds: Set<string>;
    }
  >();

  for (const lesson of bank.lessons) {
    for (const item of lesson.items) {
      const markedAt = marks[item.id];
      if (!markedAt) continue;
      const key = confusionGroupKey(item);
      const existing = groups.get(key);
      if (existing) {
        existing.lessonIds.add(item.lessonId);
        existing.types.add(item.type);
        existing.sourceItemIds.add(item.id);
        if (!existing.reading && item.reading) existing.reading = item.reading;
        if (Date.parse(markedAt) > Date.parse(existing.markedAt)) {
          existing.markedAt = markedAt;
        }
        if (item.type !== "vocabulary") existing.category = "sentence";
        continue;
      }

      groups.set(key, {
        key,
        japanese: item.japanese,
        korean: item.korean,
        reading: item.reading,
        lessonIds: new Set([item.lessonId]),
        types: new Set([item.type]),
        sourceItemIds: new Set([item.id]),
        markedAt,
        category: item.type === "vocabulary" ? "vocabulary" : "sentence",
      });
    }
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      lessonIds: [...group.lessonIds].sort((a, b) => a - b),
      types: [...group.types],
      sourceItemIds: [...group.sourceItemIds],
    }))
    .sort((a, b) => Date.parse(b.markedAt) - Date.parse(a.markedAt));
}
