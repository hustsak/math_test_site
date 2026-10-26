import type { Metadata } from 'next';
import ParentTrackingView from '@/components/ParentTrackingView';
import { fetchParentViewData } from '@/lib/parentTrackingServer';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'តាមដានលទ្ធផលលំហាត់ / Parent Tracking',
  description: 'តាមដានលទ្ធផលលំហាត់គណិតវិទ្យារបស់កូនអ្នក',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default async function ParentTrackingPage({
  params,
}: {
  params: { token: string };
}) {
  const initialData = await fetchParentViewData(params.token);

  return (
    <>
      <head>
        <meta name="robots" content="noindex,nofollow" />
      </head>
      <main style={{ minHeight: '100vh', backgroundColor: 'var(--theme-page-bg, #f6f7f9)' }}>
        <ParentTrackingView token={params.token} initialData={initialData} />
      </main>
    </>
  );
}
