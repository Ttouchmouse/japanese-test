import { useEffect, useRef, useState, type FormEvent } from "react";
import { AudioButton } from "./AudioButton";
import { isAnswerCorrect, RECALL_REMEMBERED } from "../lib/answer";
import { audioCueFor } from "../lib/audio";
import type { QuizAnswers, QuizQuestion } from "../types";

interface QuizProps {
  questions: QuizQuestion[];
  answers: QuizAnswers;
  confusedSourceItemIds: string[];
  currentIndex: number;
  onAnswer: (answer: string) => void;
  onToggleConfusion: (sourceItemId: string) => void;
  onNavigate: (index: number) => void;
  onFinish: () => void;
  onExit: () => void;
}

const OPTION_LABELS = ["A", "B", "C", "D", "E"];

interface ConfusionToggleProps {
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}

function ConfusionToggle({ selected, disabled, onToggle }: ConfusionToggleProps) {
  return (
    <button
      className={`confusion-toggle is-icon-only${selected ? " is-selected" : ""}`}
      type="button"
      aria-label="헷갈려요"
      aria-pressed={selected}
      title="헷갈려요"
      disabled={disabled}
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 21V4m0 1h10.3c.9 0 1.4 1 .9 1.7L15.8 9l1.4 2.3c.5.7 0 1.7-.9 1.7H6" />
      </svg>
    </button>
  );
}

export function Quiz({
  questions,
  answers,
  confusedSourceItemIds,
  currentIndex,
  onAnswer,
  onToggleConfusion,
  onNavigate,
  onFinish,
  onExit,
}: QuizProps) {
  const question = questions[currentIndex];
  const selectedAnswer = answers[question.id];
  const [draftAnswer, setDraftAnswer] = useState(selectedAnswer ?? "");
  const feedbackRef = useRef<HTMLDivElement>(null);
  const answered = selectedAnswer !== undefined;
  const isCorrect = isAnswerCorrect(question, selectedAnswer);
  const isConfused = confusedSourceItemIds.includes(question.sourceItemId);
  const audioCue = audioCueFor(question.sourceItemId);
  const allAnswered = questions.every((item) => answers[item.id] !== undefined);
  const isLast = currentIndex === questions.length - 1;

  useEffect(() => {
    setDraftAnswer(answers[question.id] ?? "");
  }, [answers, question.id]);

  useEffect(() => {
    if (!answered) return;
    const frame = window.requestAnimationFrame(() => {
      feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [answered, question.id]);

  const optionClass = (option: string) => {
    if (!answered) return "answer-option";
    if (option === question.correctAnswer) return "answer-option is-correct";
    if (option === selectedAnswer) return "answer-option is-wrong";
    return "answer-option is-muted";
  };

  const submitTextAnswer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const answer = draftAnswer.trim();
    if (!answer || answered) return;
    onAnswer(answer);
  };

  return (
    <main className="quiz-page">
      <section className="quiz-shell" aria-labelledby="question-prompt">
        <div className="quiz-toolbar">
          <button className="text-button" type="button" onClick={onExit}>나가기</button>
          <span>{currentIndex + 1} / {questions.length}</span>
        </div>

        <div className="progress-track" aria-hidden="true">
          <span style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }} />
        </div>

        <div className="prompt-block">
          <p>
            {question.answerKind === "self"
              ? "일본어 문장을 떠올려 말해 보세요."
              : question.answerKind === "text"
              ? "일본어로 입력해 보세요."
              : question.direction === "ja-ko"
                ? "뜻이 맞는 것을 고르세요."
                : "일본어 표현을 고르세요."}
          </p>
          <h1 id="question-prompt" lang={question.direction === "ja-ko" ? "ja" : "ko"}>
            {question.prompt}
          </h1>
          {question.direction === "ja-ko" && question.reading && question.reading !== question.prompt && (
            <span className="reading" lang="ja">{question.reading}</span>
          )}
          {question.direction === "ja-ko" && audioCue && (
            <div className="prompt-audio">
              <AudioButton src={audioCue.src} />
            </div>
          )}
        </div>

        {answered && question.answerKind !== "choice" && (
          <div className="answer-reveal" ref={feedbackRef} aria-live="polite">
            <div className="answer-reveal-text">
              <strong lang="ja">{question.japanese}</strong>
              {question.reading && question.reading !== question.japanese && (
                <span lang="ja">{question.reading}</span>
              )}
            </div>
            {audioCue && <AudioButton src={audioCue.src} />}
          </div>
        )}

        {question.answerKind === "choice" ? (
          <div className="answer-list" role="group" aria-label="답안">
            {question.options.map((option, index) => (
              <button
                className={optionClass(option)}
                type="button"
                key={`${question.id}-${option}`}
                disabled={answered}
                aria-pressed={selectedAnswer === option}
                onClick={() => onAnswer(option)}
              >
                <span className="option-label">{OPTION_LABELS[index]}</span>
                <span lang={question.direction === "ja-ko" ? "ko" : "ja"}>{option}</span>
                {answered && option === question.correctAnswer && <span className="answer-icon" aria-label="정답">✓</span>}
                {answered && option === selectedAnswer && option !== question.correctAnswer && (
                  <span className="answer-icon" aria-label="오답">×</span>
                )}
              </button>
            ))}
          </div>
        ) : question.answerKind === "text" ? (
          <form className="text-answer-stage" onSubmit={submitTextAnswer}>
            <label htmlFor="text-answer">일본어 답</label>
            <input
              id="text-answer"
              lang="ja"
              type="text"
              inputMode="text"
              enterKeyHint="done"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={draftAnswer}
              disabled={answered}
              aria-invalid={answered && !isCorrect}
              onChange={(event) => setDraftAnswer(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && event.nativeEvent.isComposing) {
                  event.preventDefault();
                }
              }}
            />
            <p>한자 단어는 히라가나로 입력해도 돼요.</p>
            <button
              className="primary-button"
              type="submit"
              disabled={answered || !draftAnswer.trim()}
            >
              정답 확인
            </button>
          </form>
        ) : answered ? null : (
          <div className="recall-action">
            <button
              className="primary-button"
              type="button"
              onClick={() => onAnswer(RECALL_REMEMBERED)}
            >
              정답 확인
            </button>
          </div>
        )}

        <div className="quiz-actions">
          <ConfusionToggle
            selected={isConfused}
            disabled={!answered}
            onToggle={() => onToggleConfusion(question.sourceItemId)}
          />
          <button
            className="secondary-button"
            type="button"
            disabled={currentIndex === 0}
            onClick={() => onNavigate(currentIndex - 1)}
          >
            이전 문제
          </button>
          {isLast ? (
            <button className="primary-button" type="button" disabled={!allAnswered} onClick={onFinish}>
              결과 보기
            </button>
          ) : (
            <button
              className="primary-button"
              type="button"
              disabled={!answered}
              onClick={() => onNavigate(currentIndex + 1)}
            >
              다음 문제
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
