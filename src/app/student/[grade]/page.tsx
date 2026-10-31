import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import StudentPortalPage from '../page';
import { adminDb } from '@/lib/firebaseAdmin';
import { findGradeCode, gradeLabelEn, gradeLabelKh, type GradeCodes } from '@/lib/gradeLabels';

interface Props {
  params: {
    grade: string;
  };
}

let cachedCodes: { codes: GradeCodes; expiresAt: number } | null = null;

async function loadGradeCodes(): Promise<GradeCodes> {
  const now = Date.now();
  if (cachedCodes && cachedCodes.expiresAt > now) {
    return cachedCodes.codes;
  }
  try {
    const snap = await adminDb().collection('settings').doc('app').get();
    const codes = snap.exists ? snap.data()?.gradeCodes : null;
    const res = codes && typeof codes === 'object' ? (codes as GradeCodes) : {};
    cachedCodes = { codes: res, expiresAt: now + 60000 };
    return res;
  } catch {
    return {};
  }
}

// "grade-7", "7", "g7" -> 7, and a class name such as "វិញ្ញាសាពេទ្យ" -> its grade number
function parseGradeParam(raw: string, codes: GradeCodes): number | null {
  if (!raw) return null;
  const decoded = decodeURIComponent(raw).trim().toLowerCase();
  const named = findGradeCode(decoded, codes);
  if (named !== null) return named;
  // Match "grade-7", "grade7", "7", "g7", "ថ្នាក់ទី7", etc.
  const match = decoded.match(/\d+/);
  if (!match) return null;
  const num = parseInt(match[0], 10);
  if (num >= 1 && num <= 30) {
    return num;
  }
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const codes = await loadGradeCodes();
  const gradeNum = parseGradeParam(params.grade, codes);
  if (!gradeNum) {
    return {
      title: 'រកមិនឃើញទំព័រ (Page Not Found)',
    };
  }
  const kh = gradeLabelKh(gradeNum, codes);
  const en = gradeLabelEn(gradeNum, codes);
  return {
    title: `លំហាត់គណិតវិទ្យា ${kh} (${en}) | Student Portal`,
    description: `តំណភ្ជាប់អចិន្ត្រៃយ៍សម្រាប់សិស្ស${kh} ចូលរៀន និងធ្វើលំហាត់គណិតវិទ្យា`,
  };
}

export default async function GradeStudentPortalPage({ params }: Props) {
  const codes = await loadGradeCodes();
  const gradeNum = parseGradeParam(params.grade, codes);
  if (!gradeNum) {
    notFound();
  }

  return <StudentPortalPage targetGrade={gradeNum} />;
}
