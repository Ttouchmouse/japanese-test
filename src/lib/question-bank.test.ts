import { describe, expect, it } from "vitest";
import questionBankData from "../data/question-bank.json";
import type { QuestionBank, StudyItem } from "../types";

const bank = questionBankData as QuestionBank;

describe("lesson 31–40 source-checked textbook data", () => {
  const reviewedLessons = bank.lessons.filter((lesson) => lesson.id >= 31 && lesson.id <= 40);
  const expectedCounts = [
    [11, 24, 12], [6, 24, 13], [11, 24, 8], [8, 24, 12], [10, 24, 12],
    [6, 24, 11], [8, 24, 11], [9, 24, 11], [8, 24, 12], [6, 24, 9],
  ];

  it("contains all vocabulary rows, 24 examples per lesson, and complete dialogue turns", () => {
    reviewedLessons.forEach((lesson, index) => {
      expect(["vocabulary", "pattern", "conversation"].map((type) =>
        lesson.items.filter((item) => item.type === type).length,
      )).toEqual(expectedCounts[index]);
    });
    expect(reviewedLessons.flatMap((lesson) => lesson.items)).toHaveLength(434);
  });

  it("restores number-leading examples and cross-page continuation rows in audio order", () => {
    expect(bank.lessons[31].items.filter((i) => i.type === "pattern")[2].japanese)
      .toBe("3時にタクシーを降りました。");
    expect(bank.lessons[34].items.filter((i) => i.type === "pattern")[1].japanese)
      .toBe("5時に空港に着いた。");
    expect(bank.lessons[32].items.filter((i) => i.type === "pattern").slice(-2).map((i) => i.japanese))
      .toEqual(["うん、説明しなかった。", "ううん、した。"]);
    expect(findItem(38, "1時間?!").korean).toBe("한 시간?!");
  });

  it("keeps original IDs for repaired words and uses source-provided name readings", () => {
    expect(findItem(31, "降りる").id).toBe("l31-v-9b91461ad7fe");
    expect(findItem(34, "練習").id).toBe("l34-v-23b3a16d8291");
    expect(findItem(40, "切符").id).toBe("l40-v-1d92e5a8f96b");
    expect(findItem(33, "嵩、今日は宿題、持って来た?").reading).toBe("嵩(たかし)");
    expect(findItem(37, "はい、中野でございます。").korean).toBe("네, 나카노입니다.");
    expect(findItem(40, "上野ですか。2番線ですよ。").korean).toBe("우에노요? 2번 승강장이에요.");
  });

  it("does not expose grammar headings or broken two-column fragments as questions", () => {
    for (const lesson of reviewedLessons) {
      for (const item of lesson.items) {
        expect(item.japanese).not.toMatch(/ [1-5]$|^\)/);
        expect(item.korean).not.toMatch(/오 늘|어 제|그 렇|내렸 어|아 니|[ぁ-ヿ一-龯]/);
      }
    }
    expect(bank.lessons[32].items.some((i) => i.japanese === "した。")).toBe(false);
    expect(bank.lessons[33].items.some((i) => i.japanese === "しました。")).toBe(false);
  });
});
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

describe("lesson 25–30 textbook data", () => {
  const laterLessons = bank.lessons.filter((lesson) => lesson.id >= 25 && lesson.id <= 30);

  it("keeps the verified item counts by lesson and type", () => {
    const expected = {
      25: { vocabulary: 10, pattern: 24, conversation: 13 },
      26: { vocabulary: 10, pattern: 23, conversation: 11 },
      27: { vocabulary: 12, pattern: 24, conversation: 9 },
      28: { vocabulary: 10, pattern: 24, conversation: 12 },
      29: { vocabulary: 12, pattern: 20, conversation: 12 },
      30: { vocabulary: 10, pattern: 20, conversation: 13 },
    } as const;

    laterLessons.forEach((lesson) => {
      const counts = lesson.items.reduce(
        (result, item) => ({ ...result, [item.type]: result[item.type] + 1 }),
        { vocabulary: 0, pattern: 0, conversation: 0 },
      );
      expect(counts).toEqual(expected[lesson.id as keyof typeof expected]);
    });
  });

  it("restores conversation turns skipped by two-column PDF extraction", () => {
    expect(findItem(25, "ここが大阪城?桜がきれい!").korean).toBe(
      "여기가 오사카성이야? 벚꽃이 예쁘다!",
    );
    expect(findItem(25, "竜也も写真撮らない?").korean).toContain("류야");
    expect(findItem(26, "今日、真奈美に飴を渡しますか。").korean).toContain("마나미");
    expect(findItem(27, "恵子は結婚しないつもり?").korean).toContain("게이코");
    expect(findItem(28, "うちでゆっくり休むつもりです。森さんは?").korean).toContain(
      "모리 씨",
    );
    expect(findItem(29, "あれ?雄太、たばこ吸うの?").korean).toContain("유타");
    expect(findItem(29, "シャワー").korean).toBe("샤워");
    expect(findItem(29, "外").reading).toBe("そと");
    expect(findItem(30, "遠藤さんは何で行きますか。").korean).toContain("엔도 씨");
  });

  it("does not expose PDF line-break fragments", () => {
    const laterItems = laterLessons.flatMap((lesson) => lesson.items);
    expect(laterItems.every((item) => !/(콘 서트|그 리고)/.test(item.korean))).toBe(true);
    expect(laterItems.every((item) => !/ [1-5]$/.test(item.japanese))).toBe(true);
  });
});
