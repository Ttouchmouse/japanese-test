import { DIRECTION_LABELS, scoreQuiz, TYPE_LABELS } from "../lib/quiz";
import { isAnswerCorrect } from "../lib/answer";
import type { QuizAnswers, QuizQuestion } from "../types";

interface ResultProps {
  questions: QuizQuestion[];
  answers: QuizAnswers;
  onRetry: () => void;
  onReselect: () => void;
}

export function Result({ questions, answers, onRetry, onReselect }: ResultProps) {
  const score = scoreQuiz(questions, answers);
  const incorrect = questions.length - score;
  const percentage = Math.round((score / questions.length) * 100);

  return (
    <main className="result-page">
      <section className="result-hero" aria-labelledby="result-title">
        <p className="eyebrow">테스트 완료</p>
        <h1 id="result-title">{percentage >= 80 ? "잘 기억하고 있어요." : "한 번 더 보면 확실해질 거예요."}</h1>
        <div className="score-line">
          <strong>{score}</strong><span>/ {questions.length}</span>
        </div>
        <p>정답 {score}개 · 오답 {incorrect}개</p>
        <p className="result-memory-note">
          틀린 문제는 다음 복습에서 먼저 나와요.
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
            <h2 id="review-title">답안을 확인하세요.</h2>
          </div>
        </div>

        <ol className="review-list">
          {questions.map((question, index) => {
            const selected = answers[question.id];
            const correct = isAnswerCorrect(question, selected);
            return (
              <li className={`review-item ${correct ? "is-correct" : "is-wrong"}`} key={question.id}>
                <div className="review-number" aria-label={correct ? "정답" : "오답"}>
                  <span>{index + 1}</span>
                  <i aria-hidden="true">{correct ? "✓" : "×"}</i>
                </div>
                <div className="review-content">
                  <div className="review-meta">
                    <span>{question.lessonId}과</span>
                    <span>{TYPE_LABELS[question.type]}</span>
                    <span>{DIRECTION_LABELS[question.direction]}</span>
                  </div>
                  <h3 lang={question.direction === "ja-ko" ? "ja" : "ko"}>{question.prompt}</h3>
                  <dl>
                    {!correct && (
                      <div>
                        <dt>내 답</dt>
                        <dd>{selected}</dd>
                      </div>
                    )}
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
