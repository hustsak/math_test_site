import type { Metadata } from 'next';
import ParentTrackingView from '@/components/ParentTrackingView';
import { headers } from 'next/headers';
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
  const initialData = await fetchParentViewData(params.token, headers().get('cookie'));

  return (
    <>
      <head>
        <meta name="robots" content="noindex,nofollow" />
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.setAttribute('data-theme', 'light');`,
          }}
        />
      </head>
      <main
        data-theme="light"
        style={{
          minHeight: '100vh',
          backgroundColor: '#f8fafc',
          color: '#1b2240',
        }}
      >
        <ParentTrackingView token={params.token} initialData={initialData} />
      </main>
    </>
  );
}
