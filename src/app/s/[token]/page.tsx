import type { Metadata } from 'next';
import StudentPortalView from '@/components/StudentPortalView';
import { fetchStudentPortalData } from '@/lib/studentServer';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'កិច្ចការសិស្ស / Student Portal',
  description: 'មើលនិងធ្វើលំហាត់គណិតវិទ្យា',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default async function StudentPortalPage({
  params,
}: {
  params: { token: string };
}) {
  const initialData = await fetchStudentPortalData(params.token);

  return (
    <main style={{ minHeight: '100vh', backgroundColor: 'var(--theme-page-bg, #f6f7f9)' }}>
      <StudentPortalView token={params.token} initialData={initialData} />
    </main>
  );
}
