import Link from 'next/link';
import { Lock } from 'lucide-react';

/**
 * Shown when a student's personal link is opened on a device that did not open the teacher's
 * single-use invite first (for example a forwarded link).
 */
export default function StudentLinkLocked() {
  return (
    <div className="wrap" style={{ maxWidth: 640, paddingTop: 60 }}>
      <div
        className="card error stack"
        style={{ padding: 24, textAlign: 'center', backgroundColor: 'var(--theme-card-bg)', border: '1px solid var(--theme-border)', borderRadius: 20 }}
      >
        <Lock size={40} style={{ margin: '0 auto', color: 'var(--bad)' }} />
        <h2 style={{ margin: '8px 0 4px', fontSize: '1.35rem', color: 'var(--theme-navy)' }}>
          តំណនេះមិនអាចបើកលើឧបករណ៍នេះបានទេ
        </h2>
        <p style={{ margin: 0, color: 'var(--theme-muted)', fontSize: '0.98rem', lineHeight: 1.7 }}>
          តំណនេះប្រើបានតែលើឧបករណ៍ដែលបានបើកវាដំបូងប៉ុណ្ណោះ។ សូមសុំតំណថ្មីពីគ្រូបង្រៀនរបស់អ្នក។
        </p>
        <p style={{ margin: 0, color: 'var(--theme-muted)', fontSize: '0.92rem' }}>
          This link only works on the device that opened it first. Please ask your teacher for a new link.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
          <Link
            href="/student"
            className="btn primary"
            style={{ padding: '9px 18px', borderRadius: 10, fontWeight: 800, fontSize: '0.88rem' }}
          >
            👉 ចូលតាមឈ្មោះសិស្ស (Login by Name)
          </Link>
        </div>
      </div>
    </div>
  );
}
