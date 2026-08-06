import { useEffect, useMemo, useState } from "react";
import questionBankData from "./data/question-bank.json";
import { LessonSelection } from "./components/LessonSelection";
import { Quiz } from "./components/Quiz";
import { Result } from "./components/Result";
import { updateLearningProgress } from "./lib/progress";
import { availableQuestionCount, generateQuiz, QuizGenerationError } from "./lib/quiz";
import {
  clearSession,
  loadCategory,
  loadLearningProgress,
  loadMode,
  loadQuestionCount,
  loadSession,
  saveCategory,
  saveLearningProgress,
  saveMode,
  saveQuestionCount,
  saveSession,
} from "./lib/storage";
import type {
  LearningProgress,
  QuestionBank,
  QuizCategory,
  QuizCountOption,
  QuizMode,
  QuizSession,
} from "./types";

const questionBank = questionBankData as QuestionBank;

function createSession(
  selectedLessonIds: number[],
  mode: QuizMode,
  category: QuizCategory,
  countOption: QuizCountOption,
  progress: LearningProgress,
): QuizSession {
  const availableCount = availableQuestionCount(
    questionBank,
    selectedLessonIds,
    mode,
    category,
  );
  const questionCount = countOption === "all" ? availableCount : countOption;
  const questions = generateQuiz(
    questionBank,
    selectedLessonIds,
    Math.random,
    progress,
    new Date(),
    questionCount,
    mode,
    category,
  );
  return {
    version: 3,
    selectedLessonIds,
    mode,
    category,
    countOption,
    questionCount,
    questions,
    answers: {},
    currentIndex: 0,
    status: "quiz",
    startedAt: new Date().toISOString(),
  };
}

export default function App() {
  const [session, setSession] = useState<QuizSession | null>(() => loadSession());
  const [mode, setMode] = useState<QuizMode>(() => session?.mode ?? loadMode());
  const [category, setCategory] = useState<QuizCategory>(
    () => session?.category ?? (mode === "write" ? "vocabulary" : loadCategory()),
  );
  const [countOption, setCountOption] = useState<QuizCountOption>(
    () => session?.countOption ?? loadQuestionCount(),
  );
  const [learningProgress, setLearningProgress] = useState<LearningProgress>(() =>
    loadLearningProgress(),
  );
  const [selectedLessonIds, setSelectedLessonIds] = useState<number[]>(
    () => session?.selectedLessonIds ?? [],
  );
  const [error, setError] = useState("");
  const availableCount = useMemo(
    () => availableQuestionCount(questionBank, selectedLessonIds, mode, category),
    [selectedLessonIds, mode, category],
  );
  const requestedCount = countOption === "all" ? availableCount : countOption;

  useEffect(() => {
    if (session) saveSession(session);
  }, [session]);

  const selectedLessonsLabel = !session
    ? ""
    : session.selectedLessonIds.length <= 3
      ? session.selectedLessonIds.map((id) => `${id}과`).join(" · ")
      : `${session.selectedLessonIds.length}개 과`;

  const toggleLesson = (lessonId: number) => {
    setError("");
    setSelectedLessonIds((current) =>
      current.includes(lessonId)
        ? current.filter((id) => id !== lessonId)
        : [...current, lessonId].sort((a, b) => a - b),
    );
  };

  const changeMode = (nextMode: QuizMode) => {
    setError("");
    setMode(nextMode);
    saveMode(nextMode);
    if (nextMode === "write") {
      setCategory("vocabulary");
      saveCategory("vocabulary");
    }
  };

  const changeCategory = (nextCategory: QuizCategory) => {
    if (mode === "write" && nextCategory !== "vocabulary") return;
    setError("");
    setCategory(nextCategory);
    saveCategory(nextCategory);
  };

  const changeQuestionCount = (nextCount: QuizCountOption) => {
    setError("");
    setCountOption(nextCount);
    saveQuestionCount(nextCount);
  };

  const startQuiz = () => {
    if (!selectedLessonIds.length || availableCount === 0) {
      setError("복습할 과를 선택해 주세요.");
      return;
    }
    if (availableCount < requestedCount) {
      setError(`현재 범위에서는 ${availableCount}문제까지 풀 수 있어요.`);
      return;
    }
    try {
      setSession(
        createSession(selectedLessonIds, mode, category, countOption, learningProgress),
      );
      setError("");
      window.scrollTo({ top: 0 });
    } catch (cause) {
      setError(
        cause instanceof QuizGenerationError
          ? cause.message
          : "문제를 만드는 중 오류가 생겼습니다. 다른 과를 함께 선택해 주세요.",
      );
    }
  };

  const answerQuestion = (answer: string) => {
    setSession((current) => {
      if (!current) return current;
      const question = current.questions[current.currentIndex];
      if (current.answers[question.id] !== undefined) return current;
      return { ...current, answers: { ...current.answers, [question.id]: answer } };
    });
  };

  const navigateQuestion = (index: number) => {
    setSession((current) => {
      if (!current || index < 0 || index >= current.questions.length) return current;
      return { ...current, currentIndex: index };
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const exitQuiz = () => {
    if (session && Object.keys(session.answers).length > 0) {
      const confirmed = window.confirm("진행 중인 답안이 지워집니다. 과 선택으로 돌아갈까요?");
      if (!confirmed) return;
    }
    clearSession();
    setSelectedLessonIds(session?.selectedLessonIds ?? []);
    setSession(null);
    window.scrollTo({ top: 0 });
  };

  const finishQuiz = () => {
    if (!session) return;
    const nextProgress = updateLearningProgress(
      learningProgress,
      session.questions,
      session.answers,
    );
    setLearningProgress(nextProgress);
    saveLearningProgress(nextProgress);
    setSession({ ...session, status: "result" });
    window.scrollTo({ top: 0 });
  };

  const retryQuiz = () => {
    if (!session) return;
    setSession(
      createSession(
        session.selectedLessonIds,
        session.mode,
        session.category,
        session.countOption,
        learningProgress,
      ),
    );
    window.scrollTo({ top: 0 });
  };

  const reselectLessons = () => {
    if (!session) return;
    clearSession();
    setSelectedLessonIds(session.selectedLessonIds);
    setMode(session.mode);
    setCategory(session.category);
    setCountOption(session.countOption);
    setSession(null);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="app">
      <header className="site-header">
        <div className="header-inner">
          <span className="wordmark"><b>ことば</b> 테스트</span>
          <span className="header-status">{session ? selectedLessonsLabel : "60과 전체 수록"}</span>
        </div>
      </header>

      {!session && (
        <LessonSelection
          lessons={questionBank.lessons}
          selectedIds={selectedLessonIds}
          mode={mode}
          category={category}
          countOption={countOption}
          availableQuestionCount={selectedLessonIds.length ? availableCount : null}
          error={error}
          onToggle={toggleLesson}
          onModeChange={changeMode}
          onCategoryChange={changeCategory}
          onQuestionCountChange={changeQuestionCount}
          onStart={startQuiz}
        />
      )}

      {session?.status === "quiz" && (
        <Quiz
          questions={session.questions}
          answers={session.answers}
          currentIndex={session.currentIndex}
          onAnswer={answerQuestion}
          onNavigate={navigateQuestion}
          onFinish={finishQuiz}
          onExit={exitQuiz}
        />
      )}

      {session?.status === "result" && (
        <Result
          questions={session.questions}
          answers={session.answers}
          onRetry={retryQuiz}
          onReselect={reselectLessons}
        />
      )}

      <footer className="site-footer">
        개인 학습용 · 답안과 진행 상태는 이 기기에만 저장됩니다.
      </footer>
    </div>
  );
}
