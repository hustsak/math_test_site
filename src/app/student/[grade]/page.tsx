import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import StudentPortalPage from '../page';

interface Props {
  params: {
    grade: string;
  };
}

function parseGradeParam(raw: string): number | null {
  if (!raw) return null;
  const decoded = decodeURIComponent(raw).trim().toLowerCase();
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
  const gradeNum = parseGradeParam(params.grade);
  if (!gradeNum) {
    return {
      title: 'រកមិនឃើញទំព័រ (Page Not Found)',
    };
  }
  return {
    title: `លំហាត់គណិតវិទ្យា ថ្នាក់ទី ${gradeNum} (Grade ${gradeNum}) | Student Portal`,
    description: `តំណភ្ជាប់អចិន្ត្រៃយ៍សម្រាប់សិស្សថ្នាក់ទី ${gradeNum} ចូលរៀន និងធ្វើលំហាត់គណិតវិទ្យា`,
  };
}

export default function GradeStudentPortalPage({ params }: Props) {
  const gradeNum = parseGradeParam(params.grade);
  if (!gradeNum) {
    notFound();
  }

  return <StudentPortalPage targetGrade={gradeNum} />;
}
