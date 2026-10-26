'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin?mode=register');
  }, [router]);

  return (
    <div className="app-shell" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="card skeleton" style={{ width: '100%', maxWidth: 460, padding: '32px 24px', margin: '0 14px' }}>
        <div style={{ height: 28, width: '40%', marginBottom: 16 }} className="skeleton" />
        <div style={{ height: 16, width: '70%', marginBottom: 32 }} className="skeleton" />
        <div style={{ height: 48, marginBottom: 16 }} className="skeleton" />
        <div style={{ height: 48, marginBottom: 24 }} className="skeleton" />
        <div style={{ height: 44, borderRadius: 12 }} className="skeleton" />
      </div>
    </div>
  );
}
