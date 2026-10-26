import Link from 'next/link';

export default function Home() {
  return (
    <div className="wrap">
      <div className="card stack" style={{ textAlign: 'center', alignItems: 'center', padding: '40px 24px' }}>
        <img
          src="/logo.png"
          alt="Math Exercises"
          style={{ height: 96, width: 'auto', objectFit: 'contain', marginBottom: 16 }}
        />
        <h1 style={{ margin: '0 0 8px' }}>Math Exercises</h1>
        <p className="muted" style={{ maxWidth: 460, margin: '0 0 22px', lineHeight: 1.5 }}>
          Students: open the exercise link your teacher sent you. No account is needed.
        </p>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            className="btn"
            href="/admin"
            style={{
              padding: '10px 22px',
              borderRadius: 10,
              fontWeight: 700,
              fontSize: '0.95rem',
              boxShadow: '0 4px 14px rgba(74, 103, 214, 0.25)',
            }}
          >
            Teacher Login
          </Link>
          <Link
            className="btn secondary"
            href="/admin?mode=register"
            style={{
              padding: '10px 22px',
              borderRadius: 10,
              fontWeight: 700,
              fontSize: '0.95rem',
              border: '1px solid var(--theme-border, #d1d5db)',
              background: 'var(--theme-card-bg, #fff)',
              color: 'var(--theme-navy, #1e293b)',
            }}
          >
            Register as Teacher
          </Link>
        </div>

        <div style={{ marginTop: 14, fontSize: '0.86rem', color: 'var(--theme-muted, #64748b)' }}>
          New teacher wanting to create exercises?{' '}
          <Link
            href="/admin?mode=register"
            style={{ fontWeight: 600, color: 'var(--theme-primary, #4a67d6)', textDecoration: 'underline' }}
          >
            Register here
          </Link>
        </div>
      </div>
    </div>
  );
}
