'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import MathText from '@/components/MathText';
import ScreenGuard, { withGuardPaused } from '@/components/ScreenGuard';
import type { PublicExercise, PublicQuestion, QuestionResult } from '@/lib/types';

type Phase = 'loading' | 'error' | 'closed' | 'name' | 'taking' | 'done';

interface Attempt {
  attemptId: string;
  startedAt: number; // server clock
  clockOffset: number; // serverNow - clientNow at start
  name: string;
  answers: Record<string, string>;
}

interface Result {
  score: number;
  total: number;
  late: boolean;
  details: QuestionResult[];
}

const SYMBOLS = ['−', '×', '÷', '²', '√', 'π', '≤', '≥', '≠'];

function fmt(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// Deterministic shuffle so a refresh keeps the same order for the same attempt.
function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export default function StudentPage() {
  const { id } = useParams<{ id: string }>();
  const storeKey = `attempt:${id}`;

  const [phase, setPhase] = useState<Phase>('loading');
  const [ex, setEx] = useState<PublicExercise | null>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [studentToken, setStudentToken] = useState('');
  const [studentLocked, setStudentLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [resultTab, setResultTab] = useState<'all' | 'incorrect' | 'correct'>('all');
  const submittingRef = useRef(false);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  // Check URL query for studentToken to prefill and lock name
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      const t = p.get('token') || '';
      if (t) {
        setStudentToken(t);
        fetch(`/api/student/${t}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (d?.student?.name) {
              setName(d.student.name);
              setStudentLocked(true);
            }
          })
          .catch(() => {});
      }
    }
  }, []);

  // Question order: shuffled per attempt when the teacher enabled it
  const questions: PublicQuestion[] = useMemo(() => {
    if (!ex) return [];
    if (ex.shuffleQuestions && attempt) return seededShuffle(ex.questions, attempt.attemptId);
    return ex.questions;
  }, [ex, attempt?.attemptId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load exercise (and resume an in-progress attempt after a refresh)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/exercises/${id}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Exercise not found.');
          return setPhase('error');
        }
        setEx(data.exercise);
        if (data.closed) return setPhase('closed');
        try {
          const saved = localStorage.getItem(storeKey);
          if (saved) {
            setAttempt(JSON.parse(saved) as Attempt);
            return setPhase('taking');
          }
        } catch {}
        setPhase('name');
      } catch {
        setError('Could not load the exercise. Check your connection.');
        setPhase('error');
      }
    })();
  }, [id, storeKey]);

  const persist = useCallback(
    (a: Attempt) => {
      try {
        localStorage.setItem(storeKey, JSON.stringify(a));
      } catch {}
    },
    [storeKey],
  );

  const submit = useCallback(
    async (a: Attempt) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setBusy(true);
      setError('');
      try {
        const res = await fetch(`/api/exercises/${id}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attemptId: a.attemptId, answers: a.answers }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Submit failed');
        try {
          localStorage.removeItem(storeKey);
        } catch {}
        setResult(data);
        setPhase('done');
      } catch (e: any) {
        setError(e.message || 'Submit failed. Try again.');
        submittingRef.current = false;
      } finally {
        setBusy(false);
      }
    },
    [id, storeKey],
  );

  // Countdown timer (uses the server's clock so a wrong device clock doesn't matter)
  useEffect(() => {
    if (phase !== 'taking' || !attempt || !ex || !ex.timeLimitMinutes) return;
    const end = attempt.startedAt + ex.timeLimitMinutes * 60_000;
    const tick = () => {
      const left = end - (Date.now() + attempt.clockOffset);
      setRemaining(left);
      if (left <= 0) submit(attempt);
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [phase, attempt, ex, submit]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/exercises/${id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: name.trim(),
          ...(studentToken ? { studentToken } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not start.');
      const a: Attempt = {
        attemptId: data.attemptId,
        startedAt: data.startedAt,
        clockOffset: data.serverNow - Date.now(),
        name: name.trim(),
        answers: {},
      };
      persist(a);
      setAttempt(a);
      setPhase('taking');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function setAnswer(qid: string, value: string) {
    if (!attempt) return;
    const a = { ...attempt, answers: { ...attempt.answers, [qid]: value } };
    setAttempt(a);
    persist(a);
  }

  function insertSymbol(qid: string, sym: string) {
    const el = inputs.current[qid];
    const cur = attempt?.answers[qid] ?? '';
    const pos = el?.selectionStart ?? cur.length;
    const end = el?.selectionEnd ?? pos;
    setAnswer(qid, cur.slice(0, pos) + sym + cur.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos + sym.length, pos + sym.length);
    });
  }

  if (phase === 'loading') return <div className="wrap muted">Loading…</div>;

  if (phase === 'error')
    return (
      <div className="wrap">
        <div className="card error">{error}</div>
      </div>
    );

  if (!ex) return null;

  if (phase === 'closed')
    return (
      <div className="wrap">
        <div className="card stack">
          <h1>{ex.title}</h1>
          <p>លំហាត់នេះត្រូវបានបិទបញ្ចប់ហើយ។</p>
        </div>
      </div>
    );

  if (phase === 'name')
    return (
      <div className="wrap" style={{ maxWidth: 520 }}>
        <form className="card stack" onSubmit={start}>
          <div style={{ textAlign: 'center', marginBottom: 4 }}>
            <img
              src="/logo.png"
              alt="Math Exercises"
              style={{ height: 68, width: 'auto', objectFit: 'contain', margin: '0 auto' }}
            />
          </div>
          <h1 style={{ textAlign: 'center', marginTop: 0 }}>{ex.title}</h1>
          {ex.description && <MathText text={ex.description} />}
          <div className="muted" style={{ textAlign: 'center' }}>
            {ex.questions.length} សំណួរ
            {ex.timeLimitMinutes ? ` · រយៈពេល ${ex.timeLimitMinutes} នាទី (នាឡិកានឹងចាប់ផ្ដើមពេលចុច ចាប់ផ្ដើម)` : ''}
          </div>
          <div>
            <label>
              ឈ្មោះរបស់អ្នក {studentLocked ? '(ចាក់សោតាមបញ្ជីឈ្មោះ)' : ''}
            </label>
            <input
              value={name}
              onChange={(e) => !studentLocked && setName(e.target.value)}
              maxLength={80}
              placeholder="បញ្ចូលឈ្មោះរបស់អ្នក..."
              autoFocus={!studentLocked}
              readOnly={studentLocked}
              style={
                studentLocked
                  ? {
                      backgroundColor: 'var(--theme-border-subtle, #f0f2f6)',
                      color: 'var(--theme-navy, #1b2240)',
                      cursor: 'not-allowed',
                      fontWeight: 600,
                    }
                  : {}
              }
              required
            />
            {studentLocked && (
              <span
                style={{
                  fontSize: '0.82rem',
                  marginTop: 6,
                  display: 'block',
                  color: 'var(--good)',
                  fontWeight: 600,
                }}
              >
                ✓ ឈ្មោះពីបញ្ជីសិស្ស (ចាក់សោ)
              </span>
            )}
          </div>
          {error && <div className="error">{error}</div>}
          <button className="btn" type="submit" disabled={busy || !name.trim()}>
            {busy ? 'កំពុងចាប់ផ្ដើម…' : 'ចាប់ផ្ដើមធ្វើលំហាត់'}
          </button>
        </form>
      </div>
    );

  if (phase === 'done' && result) {
    const correctCount = result.details.filter((d) => d.correct).length;
    const incorrectCount = result.details.length - correctCount;
    const percentage = result.total > 0 ? Math.round((result.score / result.total) * 100) : 0;

    const displayedQuestions = questions
      .map((q, idx) => ({ q, originalIndex: idx + 1, detail: result.details.find((x) => x.id === q.id) }))
      .filter((item) => {
        if (!item.detail) return false;
        if (resultTab === 'correct') return item.detail.correct;
        if (resultTab === 'incorrect') return !item.detail.correct;
        return true;
      });

    return (
      <div className="wrap stack" style={{ maxWidth: 580, padding: '10px 10px 60px' }}>
        {/* Score summary card */}
        <div className="card" style={{ padding: '16px 14px', borderRadius: 12 }}>
          <div className="row spread" style={{ alignItems: 'center', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img
                src="/logo.png"
                alt="Math Logo"
                style={{ height: 42, width: 'auto', objectFit: 'contain' }}
              />
              <div>
                <h1 style={{ margin: 0, fontSize: '1.2rem', lineHeight: 1.3 }}>
                  លទ្ធផល{attempt?.name ? `: ${attempt.name}` : ''}
                </h1>
                <div className="muted" style={{ fontSize: '0.85rem' }}>
                  បានបញ្ចប់ការធ្វើតេស្ត
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '1.7rem', fontWeight: 800, color: percentage >= 50 ? '#059669' : '#dc2626' }}>
                {result.score}/{result.total}
              </span>
              <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--muted)', marginLeft: 4 }}>
                ({percentage}%)
              </span>
            </div>
          </div>

          {result.late && (
            <div className="notice" style={{ padding: '6px 10px', fontSize: '0.85rem', marginBottom: 10 }}>
              ⚠️ អ្នកបានបញ្ជូនចម្លើយហួសកំណត់ពេលវេលា។
            </div>
          )}

          {/* Correct vs Incorrect Quick Stats in 1 row */}
          <div className="row" style={{ gap: 8, marginTop: 4 }}>
            <div
              style={{
                flex: 1,
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                borderRadius: 8,
                padding: '6px 10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: '0.82rem', color: '#065f46', fontWeight: 600 }}>✓ ត្រឹមត្រូវ</span>
              <strong style={{ fontSize: '1.15rem', color: '#047857' }}>{correctCount}</strong>
            </div>
            <div
              style={{
                flex: 1,
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 8,
                padding: '6px 10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: '0.82rem', color: '#991b1b', fontWeight: 600 }}>✗ មិនត្រឹមត្រូវ</span>
              <strong style={{ fontSize: '1.15rem', color: '#b91c1c' }}>{incorrectCount}</strong>
            </div>
          </div>
        </div>

        {/* Tab Filters */}
        <div className="row" style={{ gap: 6 }}>
          <button
            type="button"
            className={`result-tab-btn ${resultTab === 'all' ? 'active' : ''}`}
            onClick={() => setResultTab('all')}
          >
            <span>ទាំងអស់</span>
            <span style={{ fontSize: '0.8rem', opacity: 0.85 }}>({result.details.length})</span>
          </button>
          <button
            type="button"
            className={`result-tab-btn ${resultTab === 'incorrect' ? 'active' : ''}`}
            onClick={() => setResultTab('incorrect')}
            style={resultTab === 'incorrect' ? { background: '#dc2626', borderColor: '#dc2626' } : {}}
          >
            <span>មិនត្រូវ</span>
            <span className={`result-badge ${resultTab === 'incorrect' ? '' : 'bad'}`} style={resultTab === 'incorrect' ? { background: '#fff', color: '#dc2626' } : {}}>
              {incorrectCount}
            </span>
          </button>
          <button
            type="button"
            className={`result-tab-btn ${resultTab === 'correct' ? 'active' : ''}`}
            onClick={() => setResultTab('correct')}
            style={resultTab === 'correct' ? { background: '#059669', borderColor: '#059669' } : {}}
          >
            <span>ត្រូវ</span>
            <span className={`result-badge ${resultTab === 'correct' ? '' : 'good'}`} style={resultTab === 'correct' ? { background: '#fff', color: '#059669' } : {}}>
              {correctCount}
            </span>
          </button>
        </div>

        {/* List of answers */}
        {displayedQuestions.length === 0 ? (
          <div className="card muted" style={{ textAlign: 'center', padding: 20, fontSize: '0.9rem' }}>
            មិនមានសំណួរក្នុងផ្នែកនេះទេ។
          </div>
        ) : (
          displayedQuestions.map(({ q, originalIndex, detail: d }) => {
            if (!d) return null;
            const isCorrect = d.correct;

            return (
              <div
                key={q.id}
                className="card q-card"
                style={{
                  borderLeft: isCorrect ? '4px solid #10b981' : '4px solid #ef4444',
                  background: isCorrect ? '#fafffc' : '#fff9f9',
                  padding: '10px 12px',
                }}
              >
                {/* Header line: Question number + prompt in single compact header */}
                <div className="row spread" style={{ alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 700, fontSize: '1.02rem', marginRight: 6 }}>
                      {originalIndex}.
                    </span>
                    <span className="q-title" style={{ fontSize: '1.02rem', fontWeight: 600 }}>
                      <MathText text={q.prompt} />
                    </span>
                  </div>
                  <span className={`result-badge ${isCorrect ? 'good' : 'bad'}`} style={{ flex: 'none', marginTop: 2 }}>
                    {isCorrect ? '✓ ត្រូវ' : '✗ ខុស'}
                  </span>
                </div>

                {/* Answers comparison row */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: '0.92rem', marginTop: 4 }}>
                  <div className="row" style={{ gap: 6, alignItems: 'baseline' }}>
                    <span className="muted" style={{ fontSize: '0.85rem' }}>ចម្លើយអ្នក:</span>
                    <strong style={{ color: isCorrect ? '#047857' : '#b91c1c' }}>
                      {d.given ? <MathText text={d.given} /> : <span style={{ fontStyle: 'italic', color: '#999' }}>(មិនឆ្លើយ)</span>}
                    </strong>
                  </div>

                  {!isCorrect && (
                    <div className="row" style={{ gap: 6, alignItems: 'baseline' }}>
                      <span className="muted" style={{ fontSize: '0.85rem' }}>ចម្លើយត្រូវ:</span>
                      <strong style={{ color: '#047857' }}>
                        <MathText text={d.correctAnswer ?? ''} />
                      </strong>
                    </div>
                  )}
                </div>

                {/* Explanation / Why it is incorrect */}
                {!isCorrect && (
                  <div className="explanation-box" style={{ marginTop: 6, padding: '8px 10px' }}>
                    <div className="explanation-title" style={{ fontSize: '0.88rem', marginBottom: 2 }}>
                      <span>💡 ពន្យល់:</span>
                    </div>
                    {d.explanation ? (
                      <div style={{ color: '#78350f', fontSize: '0.9rem', lineHeight: 1.45 }}>
                        <MathText text={d.explanation} />
                      </div>
                    ) : (
                      <div style={{ color: '#78350f', fontSize: '0.88rem', lineHeight: 1.45 }}>
                        ចម្លើយត្រឹមត្រូវគឺ <strong><MathText text={d.correctAnswer ?? ''} /></strong>
                      </div>
                    )}
                  </div>
                )}

                {/* If correct and has explanation */}
                {isCorrect && d.explanation && (
                  <div
                    style={{
                      background: '#ecfdf5',
                      borderLeft: '3px solid #10b981',
                      borderRadius: 6,
                      padding: '6px 10px',
                      marginTop: 6,
                    }}
                  >
                    <div style={{ color: '#065f46', fontWeight: 700, fontSize: '0.85rem', marginBottom: 2 }}>
                      💡 ពន្យល់:
                    </div>
                    <div style={{ color: '#047857', fontSize: '0.88rem', lineHeight: 1.45 }}>
                      <MathText text={d.explanation} />
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    );
  }

  // taking
  const answered = questions.filter((q) => (attempt?.answers[q.id] ?? '').trim()).length;
  return (
    <>
      <ScreenGuard studentName={attempt?.name ?? ''} />
      <div className="timer row spread">
        <div>
          <strong>{ex.title}</strong>
          <span className="muted"> · {attempt?.name}</span>
        </div>
        <div className="row">
          <span className="muted">
            ឆ្លើយបាន {answered}/{questions.length}
          </span>
          {remaining !== null && <span className={`t ${remaining < 60_000 ? 'low' : ''}`}>{fmt(remaining)}</span>}
        </div>
      </div>

      <div className="wrap stack" style={{ gap: 10 }}>
        {questions.map((q, i) => (
          <div className="card q-card" key={q.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <div className="q-title" style={{ fontSize: '1.2rem', fontWeight: 600, color: '#111827', lineHeight: 1.3 }}>
                <span style={{ marginRight: 6 }}>{i + 1}.</span>
                <MathText text={q.prompt} />
              </div>
              <span className="muted" style={{ fontSize: '0.78rem', marginLeft: 10, flexShrink: 0 }}>
                {q.points} {q.points === 1 ? 'ពិន្ទុ' : 'ពិន្ទុ'}
              </span>
            </div>

            {q.kind === 'choice' ? (
              <div className="stack" role="radiogroup">
                {(q.choices ?? []).map((c, k) => {
                  const selected = attempt?.answers[q.id] === String(k);
                  return (
                    <label key={k} className={`choice ${selected ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name={`q-${q.id}`}
                        checked={selected}
                        onChange={() => setAnswer(q.id, String(k))}
                      />
                      <MathText text={c} />
                    </label>
                  );
                })}
              </div>
            ) : (
              <>
                <input
                  ref={(el) => {
                    inputs.current[q.id] = el;
                  }}
                  value={attempt?.answers[q.id] ?? ''}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                  placeholder={q.kind === 'number' ? 'ចម្លើយរបស់អ្នក (ឧ. -5 ឬ 3/4)' : 'ចម្លើយរបស់អ្នក (ប្រើ * សម្រាប់ ×, ^ សម្រាប់ស្វ័យគុណ)'}
                  autoComplete="off"
                />
                {(attempt?.answers[q.id] ?? '').trim() && (
                  <div className="preview" style={{ marginTop: 6, minHeight: 36 }}>
                    <MathText text={attempt!.answers[q.id]} />
                  </div>
                )}
                <div className="row" style={{ marginTop: 8, gap: 6 }}>
                  {SYMBOLS.map((s) => (
                    <button key={s} type="button" className="sym" onClick={() => insertSymbol(q.id, s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}

        {error && <div className="error">{error}</div>}

        <div className="row spread" style={{ marginTop: 6 }}>
          <span className="muted" style={{ fontSize: '0.85rem' }}>ចម្លើយត្រូវបានរក្សាទុកដោយស្វ័យប្រវត្តិក្នងឧបករណ៍នេះ។</span>
          <button
            className="btn"
            disabled={busy}
            onClick={() => {
              if (!attempt) return;
              const blanks = questions.length - answered;
              if (
                blanks > 0 &&
                !withGuardPaused(() => confirm(`នៅសល់ ${blanks} សំណួរមិនទាន់ឆ្លើយ។ តើអ្នកពិតជាចង់បញ្ជូនចម្លើយមែនទេ?`))
              )
                return;
              submit(attempt);
            }}
          >
            {busy ? 'កំពុងបញ្ជូន…' : 'បញ្ជូនចម្លើយ (Submit)'}
          </button>
        </div>
      </div>
    </>
  );
}
