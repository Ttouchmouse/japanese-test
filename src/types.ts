export type QuestionType = "vocabulary" | "pattern" | "conversation";
export type QuestionDirection = "ja-ko" | "ko-ja";
export type QuizMode = "quick" | "write";
export type QuizCategory = "all" | "vocabulary" | "sentence";
export type QuizCount = 10 | 20 | 30;
export type QuizCountOption = QuizCount | "all";

export interface StudyItem {
  id: string;
  lessonId: number;
  type: QuestionType;
  japanese: string;
  korean: string;
  reading?: string;
  sourcePage: number;
}

export interface Lesson {
  id: number;
  title: string;
  speechLevel: string;
  startPage: number;
  endPage: number;
  items: StudyItem[];
}

export interface QuestionBank {
  version: number;
  title: string;
  lessons: Lesson[];
}

export interface QuizQuestion {
  id: string;
  sourceItemId: string;
  lessonId: number;
  type: QuestionType;
  direction: QuestionDirection;
  prompt: string;
  correctAnswer: string;
  acceptedAnswers: string[];
  answerKind: "choice" | "text";
  options: string[];
  japanese: string;
  korean: string;
  reading?: string;
}

export type QuizAnswers = Record<string, string>;

export interface ItemProgress {
  sourceItemId: string;
  attempts: number;
  correctAttempts: number;
  streak: number;
  lastResult: "correct" | "incorrect";
  lastReviewedAt: string;
  dueAt: string;
}

export type LearningProgress = Record<string, ItemProgress>;

export interface QuizSession {
  version: 3;
  selectedLessonIds: number[];
  mode: QuizMode;
  category: QuizCategory;
  countOption: QuizCountOption;
  questionCount: number;
  questions: QuizQuestion[];
  answers: QuizAnswers;
  currentIndex: number;
  status: "quiz" | "result";
  startedAt: string;
}
