import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import StudentPortalPage from '../page';

interface Props {
  params: {
    grade: string;
  };
}

const VALID_GRADES: Record<string, number> = {
  'grade-7': 7,
  'grade-8': 8,
  'grade-9': 9,
  'grade-10': 10,
  'grade-11': 11,
  'grade-12': 12,
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const gradeNum = VALID_GRADES[params.grade];
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
  const gradeNum = VALID_GRADES[params.grade];
  if (!gradeNum) {
    notFound();
  }

  return <StudentPortalPage targetGrade={gradeNum} />;
}
