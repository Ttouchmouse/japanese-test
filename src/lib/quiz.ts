import type {
  LearningProgress,
  QuestionBank,
  QuestionDirection,
  QuestionType,
  QuizCategory,
  QuizCount,
  QuizMode,
  QuizQuestion,
  StudyItem,
} from "../types";
import { progressPriority } from "./progress";
import { isAnswerCorrect } from "./answer";

export const QUIZ_COUNTS: QuizCount[] = [10, 20, 30, 100, 200];
export const QUIZ_SIZE: QuizCount = 20;

function typeTargets(quizSize: number, category: QuizCategory): Record<QuestionType, number> {
  if (category === "vocabulary") {
    return { vocabulary: quizSize, pattern: 0, conversation: 0 };
  }
  if (category === "sentence") {
    const pattern = Math.ceil(quizSize * 0.65);
    return { vocabulary: 0, pattern, conversation: quizSize - pattern };
  }

  const vocabulary = Math.floor(quizSize * 0.4);
  const pattern = Math.floor(quizSize * 0.4);
  return {
    vocabulary,
    pattern,
    conversation: quizSize - vocabulary - pattern,
  };
}

export const TYPE_LABELS: Record<QuestionType, string> = {
  vocabulary: "기본 단어",
  pattern: "기본 문형",
  conversation: "회화",
};

export const DIRECTION_LABELS: Record<QuestionDirection, string> = {
  "ja-ko": "일본어 → 한국어",
  "ko-ja": "한국어 → 일본어",
};

export const CATEGORY_LABELS: Record<QuizCategory, string> = {
  all: "전체",
  vocabulary: "단어",
  sentence: "문장",
};

type Random = () => number;

export class QuizGenerationError extends Error {}

function shuffle<T>(values: T[], random: Random): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function normalized(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function pairKey(item: StudyItem): string {
  return `${normalized(item.japanese)}|${normalized(item.korean)}`;
}

function answerFor(item: StudyItem, direction: QuestionDirection): string {
  return direction === "ja-ko" ? item.korean : item.japanese;
}

function promptFor(item: StudyItem, direction: QuestionDirection): string {
  return direction === "ja-ko" ? item.japanese : item.korean;
}

function uniqueItems(items: StudyItem[]): StudyItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = pairKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function matchesCategory(item: StudyItem, category: QuizCategory): boolean {
  if (category === "all") return true;
  if (category === "vocabulary") return item.type === "vocabulary";
  return item.type === "pattern" || item.type === "conversation";
}

function selectedItems(
  bank: QuestionBank,
  selectedLessonIds: number[],
  category: QuizCategory,
): StudyItem[] {
  const lessonSet = new Set(selectedLessonIds);
  return uniqueItems(
    bank.lessons.flatMap((lesson) => (lessonSet.has(lesson.id) ? lesson.items : [])),
  ).filter((item) => matchesCategory(item, category));
}

export function availableQuestionCount(
  bank: QuestionBank,
  selectedLessonIds: number[],
  mode: QuizMode = "quick",
  category: QuizCategory = "all",
): number {
  const effectiveCategory =
    mode === "write" ? "vocabulary" : mode === "recall" ? "sentence" : category;
  const items = selectedItems(bank, selectedLessonIds, effectiveCategory);
  if (mode === "write" || mode === "recall") return items.length;

  const pools: Record<QuestionType, StudyItem[]> = {
    vocabulary: items.filter((item) => item.type === "vocabulary"),
    pattern: items.filter((item) => item.type === "pattern"),
    conversation: items.filter((item) => item.type === "conversation"),
  };
  const answerKeys: Record<QuestionType, DirectionAnswerKeys> = {
    vocabulary: buildAnswerKeys(pools.vocabulary),
    pattern: buildAnswerKeys(pools.pattern),
    conversation: buildAnswerKeys(pools.conversation),
  };
  return items.filter((item) => eligibleDirections(item, answerKeys[item.type]).length > 0).length;
}

function compact(value: string): string {
  return normalized(value).replace(/[^\p{L}\p{N}]/gu, "");
}

function bigrams(value: string): Set<string> {
  const text = compact(value);
  if (text.length < 2) return new Set(text ? [text] : []);
  return new Set(Array.from({ length: text.length - 1 }, (_, index) => text.slice(index, index + 2)));
}

function textSimilarity(left: string, right: string): number {
  const leftBigrams = bigrams(left);
  const rightBigrams = bigrams(right);
  if (!leftBigrams.size || !rightBigrams.size) return 0;
  const shared = [...leftBigrams].filter((value) => rightBigrams.has(value)).length;
  return (2 * shared) / (leftBigrams.size + rightBigrams.size);
}

function structuralFeatures(value: string): boolean[] {
  return [
    /[?？]/u.test(value),
    /ません|ない|じゃありません|ではありません|아니|않|없/u.test(value),
    /ました|でした|だった|했|었|았/u.test(value),
    /です|ます|습니까|입니까|요[.!?？。]?$/u.test(value),
    /\d/u.test(value),
  ];
}

function distractorCandidates(
  item: StudyItem,
  direction: QuestionDirection,
  sourcePool: StudyItem[],
): StudyItem[] {
  const correct = normalized(answerFor(item, direction));
  const seen = new Set([correct]);
  const candidates: StudyItem[] = [];

  for (const candidate of sourcePool) {
    const answer = answerFor(candidate, direction);
    const key = normalized(answer);
    if (!answer || seen.has(key)) continue;
    seen.add(key);
    candidates.push(candidate);
  }

  return candidates;
}

export function selectDistractorAnswers(
  item: StudyItem,
  direction: QuestionDirection,
  sourcePool: StudyItem[],
  random: Random = Math.random,
): string[] {
  const correctAnswer = answerFor(item, direction);
  const correctPrompt = promptFor(item, direction);
  const correctFeatures = structuralFeatures(correctAnswer);

  return distractorCandidates(item, direction, sourcePool)
    .map((candidate) => {
      const candidateAnswer = answerFor(candidate, direction);
      const candidatePrompt = promptFor(candidate, direction);
      const candidateFeatures = structuralFeatures(candidateAnswer);
      const featureScore = correctFeatures.reduce(
        (score, feature, index) => score + (feature === candidateFeatures[index] ? 0.65 : -0.2),
        0,
      );
      const lengthRatio =
        Math.min(compact(correctAnswer).length, compact(candidateAnswer).length) /
        Math.max(compact(correctAnswer).length, compact(candidateAnswer).length, 1);
      const score =
        (candidate.lessonId === item.lessonId ? 4 : 0) +
        textSimilarity(correctAnswer, candidateAnswer) * 2.4 +
        textSimilarity(correctPrompt, candidatePrompt) * 1.2 +
        lengthRatio * 1.4 +
        featureScore +
        random() * 0.35;

      return { answer: candidateAnswer, score };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map(({ answer }) => answer);
}

type DirectionAnswerKeys = Record<QuestionDirection, Set<string>>;

function buildAnswerKeys(sourcePool: StudyItem[]): DirectionAnswerKeys {
  return {
    "ja-ko": new Set(sourcePool.map((item) => normalized(answerFor(item, "ja-ko")))),
    "ko-ja": new Set(sourcePool.map((item) => normalized(answerFor(item, "ko-ja")))),
  };
}

function eligibleDirections(item: StudyItem, answerKeys: DirectionAnswerKeys): QuestionDirection[] {
  return (["ja-ko", "ko-ja"] as const).filter(
    (direction) =>
      answerKeys[direction].size -
        (answerKeys[direction].has(normalized(answerFor(item, direction))) ? 1 : 0) >=
      4,
  );
}

function balancedPick(
  items: StudyItem[],
  limit: number,
  random: Random,
  progress: LearningProgress,
  now: Date,
): StudyItem[] {
  const targetCount = Math.min(limit, items.length);
  if (targetCount <= 0) return [];

  const itemsByLesson = new Map<number, StudyItem[]>();
  for (const item of items) {
    const lessonItems = itemsByLesson.get(item.lessonId) ?? [];
    lessonItems.push(item);
    itemsByLesson.set(item.lessonId, lessonItems);
  }

  const lessonQuotas = new Map(
    [...itemsByLesson.keys()].map((lessonId) => [lessonId, 0]),
  );
  let remaining = targetCount;
  while (remaining > 0) {
    const activeLessons = [...itemsByLesson.entries()]
      .filter(([lessonId, lessonItems]) =>
        (lessonQuotas.get(lessonId) ?? 0) < lessonItems.length,
      )
      .map(([lessonId]) => lessonId);
    if (!activeLessons.length) break;

    for (const lessonId of shuffle(activeLessons, random)) {
      if (remaining <= 0) break;
      lessonQuotas.set(lessonId, (lessonQuotas.get(lessonId) ?? 0) + 1);
      remaining -= 1;
    }
  }

  const prioritizedByLesson = new Map(
    [...itemsByLesson.entries()].map(([lessonId, lessonItems]) => [
      lessonId,
      lessonItems
        .map((item) => ({
          item,
          priority: progressPriority(item.id, progress, now),
          tie: random(),
        }))
        .filter(({ priority }) => priority > 0)
        .sort((left, right) => right.priority - left.priority || right.tie - left.tie)
        .map(({ item }) => item),
    ]),
  );
  const priorityLessonLimit = Math.min(
    Math.round(targetCount * 0.4),
    [...prioritizedByLesson.values()].filter((lessonItems) => lessonItems.length > 0).length,
  );
  const priorityLessons = [...prioritizedByLesson.entries()]
    .filter(([, lessonItems]) => lessonItems.length > 0)
    .map(([lessonId, lessonItems]) => ({
      lessonId,
      priority: Math.max(
        ...lessonItems.map((item) => progressPriority(item.id, progress, now)),
      ),
      tie: random(),
    }))
    .sort((left, right) => right.priority - left.priority || right.tie - left.tie)
    .slice(0, priorityLessonLimit);

  for (const { lessonId } of priorityLessons) {
    if ((lessonQuotas.get(lessonId) ?? 0) > 0) continue;
    const donor = [...lessonQuotas.entries()]
      .filter(
        ([donorLessonId, quota]) =>
          donorLessonId !== lessonId &&
          quota > 0 &&
          (prioritizedByLesson.get(donorLessonId)?.length ?? 0) === 0,
      )
      .map(([donorLessonId, quota]) => ({ donorLessonId, quota, tie: random() }))
      .sort((left, right) => right.quota - left.quota || right.tie - left.tie)[0];
    if (!donor) continue;
    lessonQuotas.set(donor.donorLessonId, donor.quota - 1);
    lessonQuotas.set(lessonId, 1);
  }

  const priorityQuotas = new Map(
    [...itemsByLesson.keys()].map((lessonId) => [lessonId, 0]),
  );
  let priorityRemaining = Math.min(
    Math.round(targetCount * 0.4),
    [...prioritizedByLesson.values()].reduce((sum, lessonItems) => sum + lessonItems.length, 0),
  );
  while (priorityRemaining > 0) {
    const activeLessons = [...prioritizedByLesson.entries()]
      .filter(([lessonId, lessonItems]) => {
        const priorityQuota = priorityQuotas.get(lessonId) ?? 0;
        return (
          priorityQuota < lessonItems.length &&
          priorityQuota < (lessonQuotas.get(lessonId) ?? 0)
        );
      })
      .map(([lessonId]) => lessonId);
    if (!activeLessons.length) break;

    for (const lessonId of shuffle(activeLessons, random)) {
      if (priorityRemaining <= 0) break;
      priorityQuotas.set(lessonId, (priorityQuotas.get(lessonId) ?? 0) + 1);
      priorityRemaining -= 1;
    }
  }

  const selected = [...itemsByLesson.entries()].flatMap(([lessonId, lessonItems]) => {
    const quota = lessonQuotas.get(lessonId) ?? 0;
    const prioritized = (prioritizedByLesson.get(lessonId) ?? []).slice(
      0,
      priorityQuotas.get(lessonId) ?? 0,
    );
    const prioritizedIds = new Set(prioritized.map((item) => item.id));
    return [
      ...prioritized,
      ...shuffle(lessonItems.filter((item) => !prioritizedIds.has(item.id)), random),
    ].slice(0, quota);
  });

  return shuffle(selected, random);
}

function chooseSources(
  items: StudyItem[],
  pools: Record<QuestionType, StudyItem[]>,
  eligibility: Map<string, QuestionDirection[]>,
  quizSize: number,
  targets: Record<QuestionType, number>,
  random: Random,
  progress: LearningProgress,
  now: Date,
): StudyItem[] {
  const selected: StudyItem[] = [];
  const selectedIds = new Set<string>();

  const take = (type: QuestionType, limit: number) => {
    const candidates = pools[type].filter((item) => (eligibility.get(item.id)?.length ?? 0) > 0);
    for (const item of balancedPick(candidates, limit, random, progress, now)) {
      if (selected.length >= quizSize || selectedIds.has(item.id)) continue;
      selected.push(item);
      selectedIds.add(item.id);
    }
  };

  (Object.keys(targets) as QuestionType[]).forEach((type) => take(type, targets[type]));

  if (selected.length < quizSize) {
    const remaining = items.filter(
      (item) =>
        !selectedIds.has(item.id) && (eligibility.get(item.id)?.length ?? 0) > 0,
    );
    for (const item of balancedPick(
      remaining,
      quizSize - selected.length,
      random,
      progress,
      now,
    )) {
      selected.push(item);
      selectedIds.add(item.id);
    }
  }

  return shuffle(selected, random);
}

function directionPlan(random: Random, quizSize: number): QuestionDirection[] {
  const half = Math.floor(quizSize / 2);
  return shuffle(
    [
      ...Array.from({ length: half }, () => "ja-ko" as const),
      ...Array.from({ length: quizSize - half }, () => "ko-ja" as const),
    ],
    random,
  );
}

function chooseWriteSources(
  items: StudyItem[],
  quizSize: number,
  random: Random,
  progress: LearningProgress,
  now: Date,
): StudyItem[] {
  return balancedPick(items, quizSize, random, progress, now);
}

export function generateQuiz(
  bank: QuestionBank,
  selectedLessonIds: number[],
  random: Random = Math.random,
  progress: LearningProgress = {},
  now = new Date(),
  quizSize: number = QUIZ_SIZE,
  mode: QuizMode = "quick",
  category: QuizCategory = "all",
): QuizQuestion[] {
  const effectiveCategory =
    mode === "write" ? "vocabulary" : mode === "recall" ? "sentence" : category;
  const items = selectedItems(bank, selectedLessonIds, effectiveCategory);

  if (mode === "write") {
    const sources = chooseWriteSources(items, quizSize, random, progress, now);
    if (sources.length < quizSize) {
      throw new QuizGenerationError(`선택한 과에는 단어가 ${sources.length}개 있습니다.`);
    }
    return sources.map((item) => ({
      id: `${item.id}-ko-ja-write`,
      sourceItemId: item.id,
      lessonId: item.lessonId,
      type: item.type,
      direction: "ko-ja",
      prompt: item.korean,
      correctAnswer: item.japanese,
      acceptedAnswers: [item.japanese, item.reading ?? ""].filter(
        (answer, index, answers) => answer && answers.indexOf(answer) === index,
      ),
      answerKind: "text",
      options: [],
      japanese: item.japanese,
      korean: item.korean,
      reading: item.reading,
    }));
  }

  if (mode === "recall") {
    const sources = chooseWriteSources(items, quizSize, random, progress, now);
    if (sources.length < quizSize) {
      throw new QuizGenerationError(`선택한 과에는 문장이 ${sources.length}개 있습니다.`);
    }
    return sources.map((item) => ({
      id: `${item.id}-ko-ja-recall`,
      sourceItemId: item.id,
      lessonId: item.lessonId,
      type: item.type,
      direction: "ko-ja",
      prompt: item.korean,
      correctAnswer: item.japanese,
      acceptedAnswers: [item.japanese],
      answerKind: "self",
      options: [],
      japanese: item.japanese,
      korean: item.korean,
      reading: item.reading,
    }));
  }

  const pools: Record<QuestionType, StudyItem[]> = {
    vocabulary: items.filter((item) => item.type === "vocabulary"),
    pattern: items.filter((item) => item.type === "pattern"),
    conversation: items.filter((item) => item.type === "conversation"),
  };
  const answerKeys: Record<QuestionType, DirectionAnswerKeys> = {
    vocabulary: buildAnswerKeys(pools.vocabulary),
    pattern: buildAnswerKeys(pools.pattern),
    conversation: buildAnswerKeys(pools.conversation),
  };
  const eligibility = new Map(
    items.map((item) => [item.id, eligibleDirections(item, answerKeys[item.type])]),
  );

  const sources = chooseSources(
    items,
    pools,
    eligibility,
    quizSize,
    typeTargets(quizSize, effectiveCategory),
    random,
    progress,
    now,
  );
  if (sources.length < quizSize) {
    throw new QuizGenerationError(`선택한 과에서 서로 다른 ${quizSize}문제를 만들 수 없습니다.`);
  }

  const plan = directionPlan(random, quizSize);
  return sources.map((item, index) => {
    const available = eligibility.get(item.id) ?? [];
    const preferred = plan[index];
    const direction = available.includes(preferred) ? preferred : available[0];
    const correctAnswer = answerFor(item, direction);
    const distractors = selectDistractorAnswers(item, direction, pools[item.type], random);
    const options = shuffle([correctAnswer, ...distractors], random);

    return {
      id: `${item.id}-${direction}`,
      sourceItemId: item.id,
      lessonId: item.lessonId,
      type: item.type,
      direction,
      prompt: promptFor(item, direction),
      correctAnswer,
      acceptedAnswers: [correctAnswer],
      answerKind: "choice",
      options,
      japanese: item.japanese,
      korean: item.korean,
      reading: item.reading,
    };
  });
}

export function scoreQuiz(questions: QuizQuestion[], answers: Record<string, string>): number {
  return questions.reduce(
    (score, question) => score + (isAnswerCorrect(question, answers[question.id]) ? 1 : 0),
    0,
  );
}
