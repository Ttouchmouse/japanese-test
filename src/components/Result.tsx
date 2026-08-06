import { DIRECTION_LABELS, scoreQuiz, TYPE_LABELS } from "../lib/quiz";
import { isAnswerCorrect } from "../lib/answer";
import type { QuizAnswers, QuizQuestion } from "../types";

interface ResultProps {
  questions: QuizQuestion[];
  answers: QuizAnswers;
  confusedSourceItemIds: string[];
  onRetry: () => void;
  onReselect: () => void;
}

export function Result({
  questions,
  answers,
  confusedSourceItemIds,
  onRetry,
  onReselect,
}: ResultProps) {
  const score = scoreQuiz(questions, answers);
  const incorrect = questions.length - score;
  const confusedIds = new Set(confusedSourceItemIds);
  const confusedCount = questions.filter((question) =>
    confusedIds.has(question.sourceItemId),
  ).length;
  const rememberedCount = questions.length - confusedCount;
  const isRecallResult = questions.every((question) => question.answerKind === "self");
  const percentage = Math.round(
    ((isRecallResult ? rememberedCount : score) / questions.length) * 100,
  );
  const displayScore = isRecallResult ? rememberedCount : score;
  const title = isRecallResult
    ? percentage >= 80
      ? "문장이 잘 떠오르고 있어요."
      : "헷갈린 문장을 모았어요."
    : percentage >= 80
      ? "잘 기억하고 있어요."
      : "한 번 더 보면 확실해질 거예요.";

  return (
    <main className="result-page">
      <section className="result-hero" aria-labelledby="result-title">
        <p className="eyebrow">{isRecallResult ? "복습 완료" : "테스트 완료"}</p>
        <h1 id="result-title">{title}</h1>
        <div className="score-line">
          <strong>{displayScore}</strong><span>/ {questions.length}</span>
        </div>
        <p>
          {isRecallResult
            ? `기억한 문장 ${rememberedCount}개 · 헷갈린 문장 ${confusedCount}개`
            : `정답 ${score}개 · 오답 ${incorrect}개`}
        </p>
        <p className="result-memory-note">
          {isRecallResult
            ? "헷갈린 문장은 다음에 같은 과를 복습할 때 먼저 나와요."
            : confusedCount > 0
              ? `헷갈린 항목 ${confusedCount}개 · 오답과 함께 다음 복습에서 먼저 나와요.`
              : "틀린 문제는 다음 복습에서 먼저 나와요."}
        </p>
        <div className="result-actions">
          <button className="primary-button" type="button" onClick={onRetry}>같은 과로 다시 풀기</button>
          <button className="secondary-button" type="button" onClick={onReselect}>과 다시 선택하기</button>
        </div>
      </section>

      <section className="review-section" aria-labelledby="review-title">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">문제별 결과</p>
            <h2 id="review-title">{isRecallResult ? "문장을 확인하세요." : "답안을 확인하세요."}</h2>
          </div>
        </div>

        <ol className="review-list">
          {questions.map((question, index) => {
            const selected = answers[question.id];
            const correct = isAnswerCorrect(question, selected);
            const selfAssessed = question.answerKind === "self";
            const confused = confusedIds.has(question.sourceItemId);
            const resultClass = selfAssessed
              ? confused
                ? "is-review"
                : "is-correct"
              : correct
                ? "is-correct"
                : "is-wrong";
            const resultLabel = selfAssessed
              ? confused
                ? "헷갈림"
                : "기억함"
              : correct
                ? "정답"
                : "오답";
            return (
              <li className={`review-item ${resultClass}`} key={question.id}>
                <div
                  className="review-number"
                  aria-label={confused && !selfAssessed ? `${resultLabel}, 헷갈림` : resultLabel}
                >
                  <span>{index + 1}</span>
                  <i aria-hidden="true">{selfAssessed && confused ? "↻" : correct ? "✓" : "×"}</i>
                </div>
                <div className="review-content">
                  <div className="review-meta">
                    <span>{question.lessonId}과</span>
                    <span>{TYPE_LABELS[question.type]}</span>
                    <span>{DIRECTION_LABELS[question.direction]}</span>
                    {confused && <span className="review-confusion">⚑ 헷갈림</span>}
                  </div>
                  <h3 lang={question.direction === "ja-ko" ? "ja" : "ko"}>{question.prompt}</h3>
                  <dl>
                    {selfAssessed ? (
                      <div>
                        <dt>평가</dt>
                        <dd>{confused ? "헷갈려요" : "기억함"}</dd>
                      </div>
                    ) : !correct ? (
                      <div>
                        <dt>내 답</dt>
                        <dd>{selected}</dd>
                      </div>
                    ) : null}
                    <div>
                      <dt>정답</dt>
                      <dd>
                        <span lang={question.direction === "ko-ja" ? "ja" : "ko"}>
                          {question.correctAnswer}
                        </span>
                        {question.answerKind === "text" && question.reading && (
                          <small className="review-reading" lang="ja">{question.reading}</small>
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </main>
  );
}
