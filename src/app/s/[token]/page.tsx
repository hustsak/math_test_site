import type { Metadata } from 'next';
import { headers } from 'next/headers';
import StudentLinkLocked from '@/components/StudentLinkLocked';
import StudentPortalView from '@/components/StudentPortalView';
import { StudentLinkLockedError } from '@/lib/studentLinkAccess';
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
  let initialData;
  try {
    initialData = await fetchStudentPortalData(params.token, headers().get('cookie'));
  } catch (e) {
    if (e instanceof StudentLinkLockedError) {
      return (
        <main style={{ minHeight: '100vh', backgroundColor: 'var(--theme-page-bg, #f6f7f9)' }}>
          <StudentLinkLocked />
        </main>
      );
    }
    throw e;
  }

  return (
    <main style={{ minHeight: '100vh', backgroundColor: 'var(--theme-page-bg, #f6f7f9)' }}>
      <StudentPortalView token={params.token} initialData={initialData} />
    </main>
  );
}
