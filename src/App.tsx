import { useEffect, useMemo, useState } from "react";
import questionBankData from "./data/question-bank.json";
import { ConfusionCollection } from "./components/ConfusionCollection";
import { LessonSelection } from "./components/LessonSelection";
import { Quiz } from "./components/Quiz";
import { Result } from "./components/Result";
import { updateLearningProgress } from "./lib/progress";
import { availableQuestionCount, generateQuiz, QuizGenerationError } from "./lib/quiz";
import {
  clearSession,
  loadCategory,
  loadConfusionMarks,
  loadLearningProgress,
  loadMode,
  loadQuestionCount,
  loadSession,
  saveCategory,
  saveConfusionMarks,
  saveLearningProgress,
  saveMode,
  saveQuestionCount,
  saveSession,
} from "./lib/storage";
import type {
  ConfusionMarks,
  LearningProgress,
  QuestionBank,
  QuizCategory,
  QuizCountOption,
  QuizMode,
  QuizSession,
} from "./types";

const questionBank = questionBankData as QuestionBank;

function mergeStoredConfusions(
  session: QuizSession | null,
  progress: LearningProgress,
): ConfusionMarks {
  const marks = loadConfusionMarks();

  for (const item of Object.values(progress)) {
    if (!item.confused || marks[item.sourceItemId]) continue;
    marks[item.sourceItemId] = item.lastReviewedAt;
  }

  if (session) {
    for (const sourceItemId of session.confusedSourceItemIds) {
      if (marks[sourceItemId]) continue;
      marks[sourceItemId] = session.startedAt;
    }
  }

  return marks;
}

function progressWithConfusions(
  progress: LearningProgress,
  marks: ConfusionMarks,
): LearningProgress {
  const next = { ...progress };

  for (const [sourceItemId, markedAt] of Object.entries(marks)) {
    const existing = next[sourceItemId];
    next[sourceItemId] = existing
      ? { ...existing, confused: true }
      : {
          sourceItemId,
          attempts: 0,
          correctAttempts: 0,
          streak: 0,
          confused: true,
          lastResult: "correct",
          lastReviewedAt: markedAt,
          dueAt: markedAt,
        };
  }

  return next;
}

function createSession(
  selectedLessonIds: number[],
  mode: QuizMode,
  category: QuizCategory,
  countOption: QuizCountOption,
  progress: LearningProgress,
  confusionMarks: ConfusionMarks,
): QuizSession {
  const availableCount = availableQuestionCount(
    questionBank,
    selectedLessonIds,
    mode,
    category,
  );
  const questionCount = countOption === "all" ? availableCount : countOption;
  const effectiveProgress = progressWithConfusions(progress, confusionMarks);
  const questions = generateQuiz(
    questionBank,
    selectedLessonIds,
    Math.random,
    effectiveProgress,
    new Date(),
    questionCount,
    mode,
    category,
  );
  const confusedSourceItemIds = questions
    .map((question) => question.sourceItemId)
    .filter((sourceItemId) => Boolean(confusionMarks[sourceItemId]));
  return {
    version: 5,
    selectedLessonIds,
    mode,
    category,
    countOption,
    questionCount,
    questions,
    answers: {},
    confusedSourceItemIds,
    currentIndex: 0,
    status: "quiz",
    startedAt: new Date().toISOString(),
  };
}

export default function App() {
  const [session, setSession] = useState<QuizSession | null>(() => loadSession());
  const [mode, setMode] = useState<QuizMode>(() => session?.mode ?? loadMode());
  const [category, setCategory] = useState<QuizCategory>(
    () =>
      session?.category ??
      (mode === "write" ? "vocabulary" : mode === "recall" ? "sentence" : loadCategory()),
  );
  const [countOption, setCountOption] = useState<QuizCountOption>(
    () => session?.countOption ?? loadQuestionCount(),
  );
  const [learningProgress, setLearningProgress] = useState<LearningProgress>(() =>
    loadLearningProgress(),
  );
  const [confusionMarks, setConfusionMarks] = useState<ConfusionMarks>(() =>
    mergeStoredConfusions(session, learningProgress),
  );
  const [selectedLessonIds, setSelectedLessonIds] = useState<number[]>(
    () => session?.selectedLessonIds ?? [],
  );
  const [showConfusionCollection, setShowConfusionCollection] = useState(false);
  const [error, setError] = useState("");
  const availableCount = useMemo(
    () => availableQuestionCount(questionBank, selectedLessonIds, mode, category),
    [selectedLessonIds, mode, category],
  );
  const requestedCount = countOption === "all" ? availableCount : countOption;

  useEffect(() => {
    if (session) saveSession(session);
  }, [session]);

  useEffect(() => {
    saveConfusionMarks(confusionMarks);
  }, [confusionMarks]);

  useEffect(() => {
    saveLearningProgress(learningProgress);
  }, [learningProgress]);

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
    const fixedCategory =
      nextMode === "write" ? "vocabulary" : nextMode === "recall" ? "sentence" : null;
    if (!fixedCategory) return;
    setCategory(fixedCategory);
    saveCategory(fixedCategory);
  };

  const changeCategory = (nextCategory: QuizCategory) => {
    if (mode !== "quick") return;
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
        createSession(
          selectedLessonIds,
          mode,
          category,
          countOption,
          learningProgress,
          confusionMarks,
        ),
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

  const setItemsConfused = (sourceItemIds: string[], confused: boolean) => {
    const markedAt = new Date().toISOString();
    setConfusionMarks((current) => {
      const next = { ...current };
      sourceItemIds.forEach((sourceItemId) => {
        if (confused) next[sourceItemId] = markedAt;
        else delete next[sourceItemId];
      });
      return next;
    });

    setLearningProgress((current) => {
      let changed = false;
      const next = { ...current };
      sourceItemIds.forEach((sourceItemId) => {
        const item = current[sourceItemId];
        if (!item || item.confused === confused) return;
        next[sourceItemId] = { ...item, confused };
        changed = true;
      });
      return changed ? next : current;
    });

    setSession((current) => {
      if (!current) return current;
      const nextIds = new Set(current.confusedSourceItemIds);
      sourceItemIds.forEach((sourceItemId) => {
        if (confused) nextIds.add(sourceItemId);
        else nextIds.delete(sourceItemId);
      });
      return { ...current, confusedSourceItemIds: [...nextIds] };
    });
  };

  const toggleQuestionConfusion = (sourceItemId: string) => {
    setItemsConfused([sourceItemId], !confusionMarks[sourceItemId]);
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
      session.confusedSourceItemIds,
    );
    setLearningProgress(nextProgress);
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
        confusionMarks,
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
    setShowConfusionCollection(false);
    setSession(null);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="app">
      <header className="site-header">
        <div className="header-inner">
          <span className="wordmark"><b>ことば</b> 테스트</span>
          <div className="header-actions">
            <span className="header-status">{session ? selectedLessonsLabel : "60과 전체 수록"}</span>
            {!session ? (
              <button
                className={`header-confusion-button${showConfusionCollection ? " is-active" : ""}`}
                type="button"
                aria-current={showConfusionCollection ? "page" : undefined}
                onClick={() => {
                  setShowConfusionCollection(true);
                  window.scrollTo({ top: 0 });
                }}
              >
                헷갈린 표현 모아보기
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {!session && !showConfusionCollection ? (
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
      ) : null}

      {!session && showConfusionCollection ? (
        <ConfusionCollection
          bank={questionBank}
          marks={confusionMarks}
          onBack={() => {
            setShowConfusionCollection(false);
            window.scrollTo({ top: 0 });
          }}
          onRemove={(sourceItemIds) => setItemsConfused(sourceItemIds, false)}
        />
      ) : null}

      {session?.status === "quiz" && (
        <Quiz
          questions={session.questions}
          answers={session.answers}
          confusedSourceItemIds={session.confusedSourceItemIds}
          currentIndex={session.currentIndex}
          onAnswer={answerQuestion}
          onToggleConfusion={toggleQuestionConfusion}
          onNavigate={navigateQuestion}
          onFinish={finishQuiz}
          onExit={exitQuiz}
        />
      )}

      {session?.status === "result" && (
        <Result
          questions={session.questions}
          answers={session.answers}
          confusedSourceItemIds={session.confusedSourceItemIds}
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
