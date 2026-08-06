import { CATEGORY_LABELS, QUIZ_COUNTS } from "../lib/quiz";
import type {
  Lesson,
  QuizCategory,
  QuizCountOption,
  QuizMode,
} from "../types";

interface LessonSelectionProps {
  lessons: Lesson[];
  selectedIds: number[];
  mode: QuizMode;
  category: QuizCategory;
  countOption: QuizCountOption;
  availableQuestionCount: number | null;
  error: string;
  onToggle: (lessonId: number) => void;
  onModeChange: (mode: QuizMode) => void;
  onCategoryChange: (category: QuizCategory) => void;
  onQuestionCountChange: (count: QuizCountOption) => void;
  onStart: () => void;
}

const CATEGORIES: QuizCategory[] = ["all", "vocabulary", "sentence"];

export function LessonSelection({
  lessons,
  selectedIds,
  mode,
  category,
  countOption,
  availableQuestionCount,
  error,
  onToggle,
  onModeChange,
  onCategoryChange,
  onQuestionCountChange,
  onStart,
}: LessonSelectionProps) {
  const selected = new Set(selectedIds);
  const selectedCount =
    countOption === "all" ? availableQuestionCount : countOption;
  const countUnavailable =
    availableQuestionCount !== null &&
    (availableQuestionCount === 0 ||
      (countOption !== "all" && countOption > availableQuestionCount));
  const modeLabel =
    mode === "write" ? "직접 입력" : mode === "recall" ? "생각하고 풀기" : "빠른 복습";

  return (
    <main className="selection-page">
      <section className="selection-hero" aria-labelledby="selection-title">
        <p className="eyebrow">나만의 일본어 복습</p>
        <h1 id="selection-title">배운 범위를 골라,<br />내 방식대로 복습해 보세요.</h1>
        <p className="hero-copy">기본 단어·문형·회화를 복습합니다.</p>
      </section>

      <section className="lesson-section" aria-labelledby="lesson-heading">
        <fieldset className="mode-fieldset">
          <legend>
            <span className="eyebrow">복습 방식</span>
            어떻게 풀어볼까요?
          </legend>
          <div className="mode-options">
            <button
              className={`mode-option${mode === "write" ? " is-selected" : ""}`}
              type="button"
              aria-pressed={mode === "write"}
              onClick={() => onModeChange("write")}
            >
              <span className="mode-check" aria-hidden="true">{mode === "write" ? "✓" : ""}</span>
              <span>
                <strong>직접 입력 <small>단어</small></strong>
                <em>한국어를 보고 일본어를 직접 입력합니다.</em>
              </span>
            </button>
            <button
              className={`mode-option${mode === "recall" ? " is-selected" : ""}`}
              type="button"
              aria-pressed={mode === "recall"}
              onClick={() => onModeChange("recall")}
            >
              <span className="mode-check" aria-hidden="true">{mode === "recall" ? "✓" : ""}</span>
              <span>
                <strong>생각하고 풀기 <small>문장</small></strong>
                <em>문장을 말한 뒤 정답과 비교합니다.</em>
              </span>
            </button>
            <button
              className={`mode-option${mode === "quick" ? " is-selected" : ""}`}
              type="button"
              aria-pressed={mode === "quick"}
              onClick={() => onModeChange("quick")}
            >
              <span className="mode-check" aria-hidden="true">{mode === "quick" ? "✓" : ""}</span>
              <span>
                <strong>빠른 복습 <small>전체</small></strong>
                <em>선택지를 보고 바로 풉니다.</em>
              </span>
            </button>
          </div>
        </fieldset>

        {mode === "quick" ? (
          <fieldset className="type-fieldset">
            <legend>
              <span className="eyebrow">문제 유형</span>
              무엇을 복습할까요?
            </legend>
            <div className="type-options">
              {CATEGORIES.map((value) => (
                <button
                  className={`type-option${category === value ? " is-selected" : ""}`}
                  type="button"
                  key={value}
                  aria-pressed={category === value}
                  onClick={() => onCategoryChange(value)}
                >
                  {CATEGORY_LABELS[value]}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        <fieldset className="count-fieldset">
          <legend>
            <span className="eyebrow">문제 수</span>
            몇 문제를 풀어볼까요?
          </legend>
          <div className="count-options">
            {QUIZ_COUNTS.map((count) => {
              const disabled =
                availableQuestionCount !== null && count > availableQuestionCount;
              return (
                <button
                  className={`count-option${countOption === count ? " is-selected" : ""}`}
                  type="button"
                  key={count}
                  disabled={disabled}
                  aria-pressed={countOption === count}
                  onClick={() => onQuestionCountChange(count)}
                >
                  <strong>{count}</strong>
                  <span>문제</span>
                </button>
              );
            })}
            <button
              className={`count-option is-all${countOption === "all" ? " is-selected" : ""}`}
              type="button"
              disabled={availableQuestionCount === 0}
              aria-pressed={countOption === "all"}
              onClick={() => onQuestionCountChange("all")}
            >
              <strong>전체</strong>
              {availableQuestionCount !== null && <small>{availableQuestionCount}문제</small>}
            </button>
          </div>
        </fieldset>

        <div className="section-heading-row lesson-heading-row">
          <div>
            <p className="eyebrow">학습 범위</p>
            <h2 id="lesson-heading">복습할 과를 선택하세요.</h2>
          </div>
          <p className="selection-count" aria-live="polite">
            <strong>{selectedIds.length}</strong>개 과 선택
          </p>
        </div>

        <div className="lesson-grid">
          {lessons.map((lesson) => {
            const isSelected = selected.has(lesson.id);
            return (
              <button
                className={`lesson-card${isSelected ? " is-selected" : ""}`}
                type="button"
                key={lesson.id}
                aria-pressed={isSelected}
                onClick={() => onToggle(lesson.id)}
              >
                <span className="lesson-number">{lesson.id}</span>
                <span className="lesson-copy">
                  <strong>{lesson.title}</strong>
                  <small>{lesson.speechLevel || "기본 표현"}</small>
                </span>
                <span className="selection-mark" aria-hidden="true">
                  {isSelected ? "✓" : ""}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="start-dock">
        <div>
          <strong>
            {!selectedIds.length
              ? "복습할 과를 선택하세요"
              : countUnavailable
                ? `${availableQuestionCount}문제까지 풀 수 있어요`
                : `${selectedIds.length}개 과 · ${selectedCount}문제`}
          </strong>
          <span>{modeLabel} · {CATEGORY_LABELS[category]}</span>
        </div>
        <button
          className="primary-button"
          type="button"
          disabled={!selectedIds.length || countUnavailable}
          onClick={onStart}
        >
          복습 시작
        </button>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </main>
  );
}
