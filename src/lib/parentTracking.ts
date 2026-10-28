import type {
  FaceEvaluation,
  FaceRating,
  ParentActivityDay,
  ParentExerciseDetail,
  ParentNotDoneExercise,
  ParentQuestionDetail,
  ParentViewData,
  Exercise,
  Submission,
} from './types';
import { toText } from './textValue';

const KH_WEEKDAYS = ['អាទិត្យ', 'ច័ន្ទ', 'អង្គារ', 'ពុធ', 'ព្រហស្បតិ៍', 'សុក្រ', 'សៅរ៍'];
const KH_MONTHS = [
  'មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា',
  'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ',
];

export function computeParentActivityDays(
  submissions: Submission[],
  lastActiveAt?: number | null,
  nowMs = Date.now()
): { recentActivityDays: ParentActivityDay[]; activeDaysCountLast7Days: number } {
  const activityCountByDateStr = new Map<string, number>();

  const toDateStr = (timestamp: number) => {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Phnom_Penh' }).format(new Date(timestamp));
    } catch {
      const d = new Date(timestamp + 7 * 3600000);
      return d.toISOString().slice(0, 10);
    }
  };

  for (const s of submissions) {
    if (s.submittedAt) {
      const dStr = toDateStr(s.submittedAt);
      activityCountByDateStr.set(dStr, (activityCountByDateStr.get(dStr) || 0) + 1);
    }
    if (s.startedAt && s.startedAt !== s.submittedAt) {
      const dStr = toDateStr(s.startedAt);
      activityCountByDateStr.set(dStr, activityCountByDateStr.get(dStr) || 1);
    }
  }

  if (lastActiveAt) {
    const dStr = toDateStr(lastActiveAt);
    activityCountByDateStr.set(dStr, activityCountByDateStr.get(dStr) || 1);
  }

  const todayStr = toDateStr(nowMs);
  const yesterdayStr = toDateStr(nowMs - 86400000);

  const days: ParentActivityDay[] = [];
  let activeCount = 0;

  // Last 7 days: from 6 days ago up to today
  for (let i = 6; i >= 0; i--) {
    const dayMs = nowMs - i * 86400000;
    const dStr = toDateStr(dayMs);
    const dateObj = new Date(dayMs);

    let dayLabelKh: string;
    let dayLabelEn: string;

    if (dStr === todayStr) {
      dayLabelKh = 'ថ្ងៃនេះ';
      dayLabelEn = 'Today';
    } else if (dStr === yesterdayStr) {
      dayLabelKh = 'ម្សិលមិញ';
      dayLabelEn = 'Yesterday';
    } else {
      const dayOfWeek = dateObj.getDay();
      dayLabelKh = KH_WEEKDAYS[dayOfWeek] || '';
      dayLabelEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek] || '';
    }

    const count = activityCountByDateStr.get(dStr) || 0;
    const hasActivity = count > 0;
    if (hasActivity) {
      activeCount++;
    }

    const dayNum = dateObj.getDate();
    const monthNum = dateObj.getMonth();
    const formattedDate = `${dayNum} ${KH_MONTHS[monthNum] || ''}`;

    days.push({
      dateStr: dStr,
      dayLabelKh,
      dayLabelEn,
      formattedDate,
      hasActivity,
      exerciseCount: count,
    });
  }

  return {
    recentActivityDays: days,
    activeDaysCountLast7Days: activeCount,
  };
}

export interface BuildParentDataInput {
  childName: string;
  className?: string;
  studentId?: string;
  studentGrade?: number;
  lastActiveAt?: number | null;
  publishedExercises: Array<{ id: string; data: Exercise }>;
  submissionsForStudent: Submission[];
  classAverageMap?: Record<string, number>;
  showClassAverage?: boolean;
}

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
  studentGrade?: number;
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
    studentGrade,
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
  const processedExIds = new Set<string>();

  for (const { id: exId, data: ex } of publishedExercises) {
    const sub = submissionByExId.get(exId);
    const now = Date.now();
    const isClosed = !!(ex.deadline && now > new Date(ex.deadline).getTime());

    if (sub) {
      processedExIds.add(exId);
      const total = sub.total ?? 0;
      const score = sub.score ?? 0;
      const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
      const { face } = getFaceRating(percentage);

      // Build question breakdown from child's submission details only
      const questions: ParentQuestionDetail[] = (sub.details || []).map((d) => ({
        id: d.id,
        prompt: toText(ex.questions.find((q) => q.id === d.id)?.prompt),
        points: d.points,
        correct: !!d.correct,
        earned: d.earned,
        // toText: older stored results may hold a choice object instead of its text
        childAnswer: toText(d.given),
        correctAnswer: toText(d.correctAnswer),
        explanation: toText(d.explanation),
      }));

      exercises.push({
        id: exId,
        title: ex.title || sub.exerciseTitle || 'Math Exercise',
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
      // Never show unpublished or draft exercises in not-done list
      if (ex.published === false) {
        continue;
      }
      // If studentGrade is specified and exercise specifies gradeLevels, only show matching grade
      if (studentGrade && Array.isArray(ex.gradeLevels) && ex.gradeLevels.length > 0) {
        if (!ex.gradeLevels.includes(studentGrade)) {
          continue;
        }
      }
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

  // Also include any historical submissions for exercises that are no longer published or were archived
  for (const [exId, sub] of submissionByExId.entries()) {
    if (!processedExIds.has(exId)) {
      const total = sub.total ?? 0;
      const score = sub.score ?? 0;
      const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
      const { face } = getFaceRating(percentage);

      const questions: ParentQuestionDetail[] = (sub.details || []).map((d) => ({
        id: d.id,
        prompt: '',
        points: d.points,
        correct: !!d.correct,
        earned: d.earned,
        // toText: older stored results may hold a choice object instead of its text
        childAnswer: toText(d.given),
        correctAnswer: toText(d.correctAnswer),
        explanation: toText(d.explanation),
      }));

      exercises.push({
        id: exId,
        title: sub.exerciseTitle || 'Math Exercise',
        description: '',
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

  const trulyPublished = publishedExercises.filter((e) => e.data.published !== false);
  const relevantTotalCount = studentGrade
    ? trulyPublished.filter(
        (e) => !e.data.gradeLevels || e.data.gradeLevels.length === 0 || e.data.gradeLevels.includes(studentGrade)
      ).length
    : trulyPublished.length;

  const { recentActivityDays, activeDaysCountLast7Days } = computeParentActivityDays(
    submissionsForStudent,
    input.lastActiveAt
  );

  const averageScorePercent =
    exercises.length > 0
      ? Math.round(exercises.reduce((acc, curr) => acc + (curr.percentage || 0), 0) / exercises.length)
      : 0;
  const overallRating = getFaceRating(averageScorePercent);

  return {
    childName,
    className,
    completedCount: exercises.length,
    totalPublishedCount: Math.max(relevantTotalCount, exercises.length),
    lastActiveAt: input.lastActiveAt || null,
    activeDaysCountLast7Days,
    recentActivityDays,
    averageScorePercent,
    overallRating,
    latestResult,
    exercises,
    notDoneExercises,
    showClassAverage,
  };
}
