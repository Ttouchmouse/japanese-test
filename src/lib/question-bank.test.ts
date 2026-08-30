import { describe, expect, it } from "vitest";
import questionBankData from "../data/question-bank.json";
import type { QuestionBank, StudyItem } from "../types";

const bank = questionBankData as QuestionBank;
const lessons = bank.lessons.filter((lesson) => lesson.id >= 19 && lesson.id <= 24);
const items = lessons.flatMap((lesson) => lesson.items);

function findItem(lessonId: number, japanese: string): StudyItem {
  const item = bank.lessons
    .find((lesson) => lesson.id === lessonId)
    ?.items.find((candidate) => candidate.japanese === japanese);
  expect(item).toBeDefined();
  return item as StudyItem;
}

describe("lesson 19–24 textbook data", () => {
  it("keeps the verified item counts by lesson and type", () => {
    const expected = {
      19: { vocabulary: 11, pattern: 24, conversation: 11 },
      20: { vocabulary: 10, pattern: 24, conversation: 13 },
      21: { vocabulary: 9, pattern: 24, conversation: 12 },
      22: { vocabulary: 11, pattern: 24, conversation: 11 },
      23: { vocabulary: 10, pattern: 24, conversation: 12 },
      24: { vocabulary: 7, pattern: 24, conversation: 11 },
    } as const;

    lessons.forEach((lesson) => {
      const counts = lesson.items.reduce(
        (result, item) => ({ ...result, [item.type]: result[item.type] + 1 }),
        { vocabulary: 0, pattern: 0, conversation: 0 },
      );
      expect(counts).toEqual(expected[lesson.id as keyof typeof expected]);
    });
  });

  it("restores the missing source rows", () => {
    expect(findItem(20, "いいですよ。石田さんも一緒にどうですか。").korean).toContain(
      "이시다 씨",
    );
    expect(findItem(21, "祐介もヘアモデルする?").korean).toBe("유스케도 헤어모델 할래?");
    expect(findItem(22, "来月").korean).toBe("다음 달");
    expect(findItem(22, "はい、しません。").korean).toBe("네, 안 해요.");
    expect(findItem(22, "そうですか。").korean).toBe("그렇군요.");
  });

  it("keeps the lesson 22 dialogue pairs in textbook order", () => {
    expect(findItem(22, "チャンミンさん、いつまた日本へ来ますか。").korean).toBe(
      "창민 씨, 언제 또 일본에 와요?",
    );
    expect(findItem(22, "来月です。来月は母を連れて来ます。").korean).toBe(
      "다음 달이요. 다음 달에는 어머니를 데려와요.",
    );
    expect(
      findItem(22, "絵美さんはキムチが好きですか。韓国のキムチはおいしいですよ。").korean,
    ).toBe("에미 씨는 김치를 좋아해요? 한국 김치는 맛있어요.");
    expect(findItem(22, "ありがとうございます。").korean).toBe("고마워요.");
  });

  it("does not expose PDF line-break fragments", () => {
    expect(items.every((item) => !/(다 음|데 려|그 래)/.test(item.korean))).toBe(true);
    expect(findItem(22, "行って来る").korean).toBe("갔다 오다, 다녀오다");
    expect(findItem(23, "お土産").korean).toBe("(여행지 등에서 사 오는) 기념 선물");
  });

  it("keeps identical repeated turns as one study item", () => {
    const repeated = bank.lessons
      .find((lesson) => lesson.id === 24)
      ?.items.filter((item) => item.type === "conversation" && item.japanese === "そうですか。");
    expect(repeated).toHaveLength(1);
  });
});
