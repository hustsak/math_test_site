import Link from 'next/link';

export default function Home() {
  return (
    <div className="wrap">
      <div className="card stack">
        <h1>Math Exercises</h1>
        <p className="muted">
          Students: open the exercise link your teacher sent you. No account is needed.
        </p>
        <div>
          <Link className="btn" href="/admin">Teacher login</Link>
        </div>
      </div>
    </div>
  );
}
