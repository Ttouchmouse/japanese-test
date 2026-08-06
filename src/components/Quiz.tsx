import { useEffect, useState, type FormEvent } from "react";
import { isAnswerCorrect } from "../lib/answer";
import { DIRECTION_LABELS, TYPE_LABELS } from "../lib/quiz";
import type { QuizAnswers, QuizQuestion } from "../types";

interface QuizProps {
  questions: QuizQuestion[];
  answers: QuizAnswers;
  currentIndex: number;
  onAnswer: (answer: string) => void;
  onNavigate: (index: number) => void;
  onFinish: () => void;
  onExit: () => void;
}

const OPTION_LABELS = ["A", "B", "C", "D", "E"];

export function Quiz({
  questions,
  answers,
  currentIndex,
  onAnswer,
  onNavigate,
  onFinish,
  onExit,
}: QuizProps) {
  const question = questions[currentIndex];
  const selectedAnswer = answers[question.id];
  const [draftAnswer, setDraftAnswer] = useState(selectedAnswer ?? "");
  const answered = selectedAnswer !== undefined;
  const isCorrect = isAnswerCorrect(question, selectedAnswer);
  const allAnswered = questions.every((item) => answers[item.id] !== undefined);
  const isLast = currentIndex === questions.length - 1;

  useEffect(() => {
    setDraftAnswer(answers[question.id] ?? "");
  }, [answers, question.id]);

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

        <div className="question-meta">
          <span>{question.lessonId}과</span>
          <span>{TYPE_LABELS[question.type]}</span>
          <span>{DIRECTION_LABELS[question.direction]}</span>
        </div>

        <div className="prompt-block">
          <p>
            {question.answerKind === "text"
              ? "일본어로 입력해 보세요."
              : question.direction === "ja-ko"
                ? "뜻이 맞는 것을 고르세요."
                : "일본어 표현을 고르세요."}
          </p>
          <h1 id="question-prompt" lang={question.direction === "ja-ko" ? "ja" : "ko"}>
            {question.prompt}
          </h1>
          {question.direction === "ja-ko" && question.reading && (
            <span className="reading" lang="ja">{question.reading}</span>
          )}
        </div>

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
        ) : (
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
        )}

        {answered && (
          <div className="feedback" aria-live="polite">
            <strong className={isCorrect ? "correct-text" : "wrong-text"}>
              {isCorrect ? "정답이에요." : "아쉬워요. 정답을 확인해 보세요."}
            </strong>
            <p>
              <span lang="ja">{question.japanese}</span>
              {question.reading && <span className="feedback-reading" lang="ja">{question.reading}</span>}
              <i aria-hidden="true">·</i>
              <span>{question.korean}</span>
            </p>
          </div>
        )}

        <div className="quiz-actions">
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
