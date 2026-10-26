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
        <p className="muted" style={{ maxWidth: 440, margin: '0 0 20px', lineHeight: 1.5 }}>
          Students: open the exercise link your teacher sent you. No account is needed.
        </p>
        <div>
          <Link className="btn" href="/admin">Teacher login</Link>
        </div>
      </div>
    </div>
  );
}
