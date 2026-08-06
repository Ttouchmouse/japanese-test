import { useMemo } from "react";
import { groupConfusedItems, type ConfusionGroup } from "../lib/confusions";
import type { ConfusionMarks, QuestionBank, QuestionType } from "../types";

interface ConfusionCollectionProps {
  bank: QuestionBank;
  marks: ConfusionMarks;
  onBack: () => void;
  onRemove: (sourceItemIds: string[]) => void;
}

const TYPE_LABELS: Record<QuestionType, string> = {
  vocabulary: "단어",
  pattern: "문형",
  conversation: "회화",
};

function formatLessons(lessonIds: number[]): string {
  if (lessonIds.length <= 3) {
    return lessonIds.map((lessonId) => `${lessonId}과`).join(" · ");
  }
  return `${lessonIds.slice(0, 2).map((lessonId) => `${lessonId}과`).join(" · ")} 외 ${lessonIds.length - 2}개 과`;
}

function ConfusionItem({
  group,
  onRemove,
}: {
  group: ConfusionGroup;
  onRemove: (sourceItemIds: string[]) => void;
}) {
  const showReading = Boolean(group.reading && group.reading !== group.japanese);

  return (
    <li className="confusion-item">
      <div className="confusion-item-heading">
        <div className="confusion-item-meta">
          <span>{formatLessons(group.lessonIds)}</span>
          {group.types.map((type) => <span key={type}>{TYPE_LABELS[type]}</span>)}
        </div>
        <button
          className="confusion-remove"
          type="button"
          aria-label={`${group.japanese} 헷갈림 해제`}
          title="헷갈림에서 빼기"
          onClick={() => onRemove(group.sourceItemIds)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 21V4m0 1h10.3c.9 0 1.4 1 .9 1.7L15.8 9l1.4 2.3c.5.7 0 1.7-.9 1.7H6" />
          </svg>
        </button>
      </div>
      <strong lang="ja">{group.japanese}</strong>
      {showReading ? <span className="confusion-reading" lang="ja">{group.reading}</span> : null}
      <p>{group.korean}</p>
    </li>
  );
}

function ConfusionSection({
  title,
  groups,
  onRemove,
}: {
  title: string;
  groups: ConfusionGroup[];
  onRemove: (sourceItemIds: string[]) => void;
}) {
  if (groups.length === 0) return null;

  return (
    <section className="confusion-section" aria-labelledby={`confusion-${title}`}>
      <div className="confusion-section-heading">
        <h2 id={`confusion-${title}`}>{title}</h2>
        <span>{groups.length}개</span>
      </div>
      <ul className="confusion-list">
        {groups.map((group) => (
          <ConfusionItem group={group} key={group.key} onRemove={onRemove} />
        ))}
      </ul>
    </section>
  );
}

export function ConfusionCollection({
  bank,
  marks,
  onBack,
  onRemove,
}: ConfusionCollectionProps) {
  const groups = useMemo(() => groupConfusedItems(bank, marks), [bank, marks]);
  const vocabulary = groups.filter((group) => group.category === "vocabulary");
  const sentences = groups.filter((group) => group.category === "sentence");

  return (
    <main className="confusion-page">
      <header className="confusion-page-heading">
        <button className="text-button" type="button" onClick={onBack}>돌아가기</button>
        <p className="eyebrow">헷갈린 표현</p>
        <h1>표시해 둔 표현을 모았어요.</h1>
        <p>{groups.length}개 표현</p>
      </header>

      {groups.length === 0 ? (
        <section className="confusion-empty" aria-labelledby="confusion-empty-title">
          <span aria-hidden="true">⚑</span>
          <h2 id="confusion-empty-title">아직 헷갈린 표현이 없어요.</h2>
          <p>문제를 푼 뒤 헷갈리는 표현에 깃발을 표시해 보세요.</p>
          <button className="primary-button" type="button" onClick={onBack}>복습하러 가기</button>
        </section>
      ) : (
        <div className="confusion-sections">
          <ConfusionSection title="단어" groups={vocabulary} onRemove={onRemove} />
          <ConfusionSection title="문장" groups={sentences} onRemove={onRemove} />
        </div>
      )}
    </main>
  );
}
