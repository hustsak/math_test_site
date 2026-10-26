import type {
  FaceEvaluation,
  FaceRating,
  ParentExerciseDetail,
  ParentNotDoneExercise,
  ParentQuestionDetail,
  ParentViewData,
  Exercise,
  Submission,
} from './types';

/**
 * Returns face, color, emoji, and Khmer/English labels based on score percentage.
 * Green happy face for 80% and above, yellow neutral face for 50-79%, red sad face under 50%.
 * Note: Never rely on color alone: always include face and text.
 */
export function getFaceRating(percentage: number): FaceEvaluation {
  const rounded = Math.round(percentage);
  if (rounded >= 80) {
    return {
      face: 'happy',
      emoji: '😊',
      color: '#15803d',
      bgColor: '#f0fdf4',
      borderColor: '#86efac',
      labelKh: 'ល្អណាស់!',
      labelEn: 'Great!',
    };
  }
  if (rounded >= 50) {
    return {
      face: 'neutral',
      emoji: '😐',
      color: '#b45309',
      bgColor: '#fffbeb',
      borderColor: '#fde68a',
      labelKh: 'ល្អបង្គួរ',
      labelEn: 'Fair',
    };
  }
  return {
    face: 'sad',
    emoji: '😟',
    color: '#b91c1c',
    bgColor: '#fef2f2',
    borderColor: '#fca5a5',
    labelKh: 'ត្រូវព្យាយាមបន្ថែម',
    labelEn: 'Needs improvement',
  };
}

/**
 * Formats remaining time until a deadline in friendly Khmer and English.
 */
export function formatKhmerCountdown(
  deadlineIso: string | null,
  nowMs = Date.now()
): { textKh: string; textEn: string; isClosed: boolean } {
  if (!deadlineIso) {
    return { textKh: 'គ្មានកាលបរិច្ឆេទ', textEn: 'No deadline', isClosed: false };
  }
  const deadlineMs = new Date(deadlineIso).getTime();
  const diff = deadlineMs - nowMs;
  if (diff <= 0) {
    return { textKh: 'ផុតកំណត់ហើយ', textEn: 'Closed', isClosed: true };
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (days >= 1) {
    return {
      textKh: `នៅសល់ ${days} ថ្ងៃ`,
      textEn: `${days} day${days > 1 ? 's' : ''} left`,
      isClosed: false,
    };
  }
  if (hours >= 1) {
    return {
      textKh: `នៅសល់ ${hours} ម៉ោង`,
      textEn: `${hours} hour${hours > 1 ? 's' : ''} left`,
      isClosed: false,
    };
  }
  const mins = Math.max(1, Math.floor(diff / (1000 * 60)));
  return {
    textKh: `នៅសល់ ${mins} នាទី`,
    textEn: `${mins} min${mins > 1 ? 's' : ''} left`,
    isClosed: false,
  };
}

export interface BuildParentDataInput {
  childName: string;
  className?: string;
  studentId?: string;
  publishedExercises: Array<{ id: string; data: Exercise }>;
  submissionsForStudent: Submission[];
  classAverageMap?: Record<string, number>;
  showClassAverage?: boolean;
}

/**
 * Pure builder function to transform raw Firestore data into sanitized ParentViewData.
 * CRITICAL PRIVACY:
 * 1. Contains ONLY this child's scores and submission details.
 * 2. Exercises the child has NOT submitted NEVER include questions, answer keys, or explanations.
 * 3. Never contains other students' names, submissions, or tokens.
 */
export function buildParentViewData(input: BuildParentDataInput): ParentViewData {
  const {
    childName,
    className,
    publishedExercises,
    submissionsForStudent,
    classAverageMap = {},
    showClassAverage = false,
  } = input;

  // Map submissions by exerciseId (take latest submitted or best score)
  const submissionByExId = new Map<string, Submission>();
  for (const sub of submissionsForStudent) {
    if (sub.status === 'submitted') {
      const existing = submissionByExId.get(sub.exerciseId);
      if (!existing || (sub.submittedAt || 0) > (existing.submittedAt || 0)) {
        submissionByExId.set(sub.exerciseId, sub);
      }
    }
  }

  const exercises: ParentExerciseDetail[] = [];
  const notDoneExercises: ParentNotDoneExercise[] = [];

  for (const { id: exId, data: ex } of publishedExercises) {
    const sub = submissionByExId.get(exId);
    const now = Date.now();
    const isClosed = !!(ex.deadline && now > new Date(ex.deadline).getTime());

    if (sub) {
      const total = sub.total ?? 0;
      const score = sub.score ?? 0;
      const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
      const { face } = getFaceRating(percentage);

      // Build question breakdown from child's submission details only
      const questions: ParentQuestionDetail[] = (sub.details || []).map((d) => ({
        id: d.id,
        prompt: (ex.questions.find((q) => q.id === d.id)?.prompt) || '',
        points: d.points,
        correct: !!d.correct,
        earned: d.earned,
        childAnswer: d.given ?? '',
        correctAnswer: d.correctAnswer ?? '',
        explanation: d.explanation ?? '',
      }));

      exercises.push({
        id: exId,
        title: ex.title,
        description: ex.description,
        submitted: true,
        submittedAt: sub.submittedAt,
        late: !!sub.late,
        score,
        total,
        percentage,
        face,
        classAveragePercent: showClassAverage ? (classAverageMap[exId] ?? null) : null,
        questions,
      });
    } else {
      // Exercise not submitted by this child.
      // NEVER leak question prompts, answers, or explanations!
      notDoneExercises.push({
        id: exId,
        title: ex.title,
        deadline: ex.deadline,
        timeLimitMinutes: ex.timeLimitMinutes || 0,
        questionCount: ex.questions.length,
        isClosed,
      });
    }
  }

  // Sort exercises newest first (by submittedAt desc)
  exercises.sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));

  const latestResult =
    exercises.length > 0 && exercises[0].submittedAt
      ? {
          exerciseId: exercises[0].id,
          title: exercises[0].title,
          score: exercises[0].score || 0,
          total: exercises[0].total || 0,
          percentage: exercises[0].percentage || 0,
          face: exercises[0].face || 'neutral',
          submittedAt: exercises[0].submittedAt,
        }
      : null;

  return {
    childName,
    className,
    completedCount: exercises.length,
    totalPublishedCount: publishedExercises.length,
    latestResult,
    exercises,
    notDoneExercises,
    showClassAverage,
  };
}
