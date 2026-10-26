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
  /** Optional Chapter: e.g. "ជំពូកទី ១ ៖ ចំនួនគត់" */
  chapter?: string;
  /** Optional Topic: e.g. "មេរៀនទី ២ ៖ ប្រភាគ" */
  topic?: string;
  /** 0 = no time limit */
  timeLimitMinutes: number;
  /** ISO string, or null for no deadline */
  deadline: string | null;
  published: boolean;
  oneAttemptPerName: boolean;
  /** Each student sees the questions in a different order. */
  shuffleQuestions?: boolean;
  /** Grades targeted: e.g. [7], [7, 8], [9, 10, 11, 12] */
  gradeLevels?: number[];
  /** 'instant' | 'scheduled' | 'draft' */
  publicationMode?: 'instant' | 'scheduled' | 'draft';
  /** ISO string or timestamp of when exercise becomes available to students */
  scheduledPublishAt?: string | number | null;
  /** Default: Asia/Phnom_Penh */
  timezone?: string;
  questions: Question[];
  createdAt: number;
  updatedAt: number;
}

/** What a student is allowed to see before submitting (no answers). */
export type PublicQuestion = Omit<Question, 'answer' | 'explanation'>;

export interface PublicExercise {
  id: string;
  title: string;
  description: string;
  chapter?: string;
  topic?: string;
  timeLimitMinutes: number;
  deadline: string | null;
  shuffleQuestions?: boolean;
  gradeLevels?: number[];
  scheduledPublishAt?: string | number | null;
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
  exerciseTitle?: string;
  studentName: string;
  studentId?: string;
  profileId?: string;
  grade?: number;
  nameKey: string;
  status: 'started' | 'submitted';
  startedAt: number;
  submittedAt?: number;
  late?: boolean;
  score?: number;
  total?: number;
  answers?: Record<string, string>;
  details?: QuestionResult[];
}

export interface Profile {
  id: string;
  name: string;
  className?: string | null;
  profileKey: string;
  parentToken: string;
  claimSecretHash: string;
  createdAt: number;
  hidden?: boolean;
  lastActivityAt?: number | null;
}

export interface ProfileWithStats extends Profile {
  completedCount: number;
  averagePercent: number | null;
  lastActivity: number | null;
}

export type StudentAccessStatus = 'active' | 'expiring_soon' | 'expired' | 'blocked';

export interface StudentAccess {
  id: string;
  name: string;
  nameKey: string;
  grade: number; // Grades 7-12
  className: string | null;
  classKey: string;
  accessEnabled: boolean;
  expiresAt: number; // UTC ms of exclusive end-of-day boundary
  expirationDate: string; // "YYYY-MM-DD" in Asia/Phnom_Penh
  createdAt: number;
  updatedAt: number;
  lastActivityAt: number | null;
  status: StudentAccessStatus;
  studentToken?: string;
  parentToken?: string;
  active?: boolean;
}

export interface Student {
  id: string;
  name: string;
  grade?: number;
  className?: string;
  studentToken: string;
  parentToken: string;
  active: boolean;
  createdAt: number;
}

export interface AppSettings {
  showClassAverageToParents?: boolean;
}

export type FaceRating = 'happy' | 'neutral' | 'sad';

export interface FaceEvaluation {
  face: FaceRating;
  emoji: string;
  color: string;
  bgColor: string;
  borderColor: string;
  labelKh: string;
  labelEn: string;
}

export interface ParentQuestionDetail {
  id: string;
  prompt: string;
  points: number;
  correct: boolean;
  earned: number;
  childAnswer: string;
  correctAnswer: string;
  explanation: string;
}

export interface ParentExerciseDetail {
  id: string;
  title: string;
  description?: string;
  submitted: boolean;
  submittedAt?: number;
  late?: boolean;
  score?: number;
  total?: number;
  percentage?: number;
  face?: FaceRating;
  classAveragePercent?: number | null;
  questions?: ParentQuestionDetail[];
}

export interface ParentNotDoneExercise {
  id: string;
  title: string;
  deadline: string | null;
  timeLimitMinutes: number;
  questionCount: number;
  isClosed: boolean;
}

export interface ParentViewData {
  childName: string;
  className?: string;
  completedCount: number;
  totalPublishedCount: number;
  latestResult?: {
    exerciseId: string;
    title: string;
    score: number;
    total: number;
    percentage: number;
    face: FaceRating;
    submittedAt: number;
  } | null;
  exercises: ParentExerciseDetail[];
  notDoneExercises: ParentNotDoneExercise[];
  showClassAverage?: boolean;
}

export interface StudentViewExercise {
  id: string;
  title: string;
  description: string;
  deadline: string | null;
  timeLimitMinutes: number;
  questionCount: number;
  isClosed: boolean;
  isDone: boolean;
  score?: number;
  total?: number;
  submittedAt?: number;
}

export interface StudentViewData {
  student: {
    id: string;
    name: string;
    className?: string;
  };
  exercises: StudentViewExercise[];
}
