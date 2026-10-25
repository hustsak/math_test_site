export type QuestionKind = 'number' | 'text' | 'choice';

export interface Question {
  id: string;
  /** Text with optional LaTeX: $inline$ and $$display$$ */
  prompt: string;
  kind: QuestionKind;
  /**
   * number/text: correct answer; use | to separate accepted alternatives, e.g. "x>=2|x≥2".
   * choice: the INDEX of the correct choice as a string ("0", "1", ...).
   */
  answer: string;
  /** Only for kind === 'choice' (2 to 6 options; each may contain $latex$) */
  choices?: string[];
  points: number;
  /** Shown to students after submitting (Khmer or any language; supports $latex$) */
  explanation: string;
  /** True while the question came from AI and has not been reviewed by the teacher. */
  aiGenerated?: boolean;
}

export interface Exercise {
  title: string;
  description: string;
  /** 0 = no time limit */
  timeLimitMinutes: number;
  /** ISO string, or null for no deadline */
  deadline: string | null;
  published: boolean;
  oneAttemptPerName: boolean;
  /** Each student sees the questions in a different order. */
  shuffleQuestions?: boolean;
  questions: Question[];
  createdAt: number;
  updatedAt: number;
}

/** What a student is allowed to see before submitting (no answers). */
export interface PublicQuestion {
  id: string;
  prompt: string;
  kind: QuestionKind;
  choices?: string[];
  points: number;
}

export interface PublicExercise {
  id: string;
  title: string;
  description: string;
  timeLimitMinutes: number;
  deadline: string | null;
  shuffleQuestions?: boolean;
  questions: PublicQuestion[];
}

export interface QuestionResult {
  id: string;
  /** Human-readable answer (for multiple choice: the text of the chosen option). */
  given: string;
  /** Raw submitted value (for multiple choice: the option index). Used by regrading. */
  raw?: string;
  correct: boolean;
  earned: number;
  points: number;
  /** Included in the response to the student after submitting. */
  correctAnswer?: string;
  explanation?: string;
}

export interface Submission {
  exerciseId: string;
  studentName: string;
  nameKey: string;
  status: 'started' | 'submitted';
  startedAt: number;
  submittedAt?: number;
  late?: boolean;
  score?: number;
  total?: number;
  details?: QuestionResult[];
}
