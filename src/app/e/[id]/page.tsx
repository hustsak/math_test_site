'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { Sun, Moon } from 'lucide-react';
import MathText from '@/components/MathText';
import ChoiceText from '@/components/ChoiceText';
import ScreenGuard, { withGuardPaused, withGuardPausedAsync } from '@/components/ScreenGuard';
import type { PublicExercise, PublicQuestion, QuestionResult } from '@/lib/types';

type Phase = 'loading' | 'error' | 'closed' | 'name' | 'taking' | 'done';

interface Attempt {
  attemptId: string;
  startedAt: number; // server clock
  clockOffset: number; // serverNow - clientNow at start
  name: string;
  className?: string;
  profileId?: string;
  claimSecret?: string;
  answers: Record<string, string>;
}

interface Result {
  score: number;
  total: number;
  late: boolean;
  details: QuestionResult[];
  parentLink?: string;
  studentName?: string;
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
  const [className, setClassName] = useState('');
  const [studentToken, setStudentToken] = useState('');
  const [studentLocked, setStudentLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [resultTab, setResultTab] = useState<'all' | 'incorrect' | 'correct'>('all');
  const [copiedParentLink, setCopiedParentLink] = useState(false);
  const [showResultQr, setShowResultQr] = useState(false);
  const [showSavedParentModal, setShowSavedParentModal] = useState(false);
  const [savedParentLink, setSavedParentLink] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const submittingRef = useRef(false);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  // Initialize theme from localStorage or system preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('mathtest_theme') as 'light' | 'dark' | null;
      if (savedTheme) {
        setTheme(savedTheme);
        document.documentElement.setAttribute('data-theme', savedTheme);
      } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        setTheme('dark');
        document.documentElement.setAttribute('data-theme', 'dark');
      } else {
        setTheme('light');
        document.documentElement.setAttribute('data-theme', 'light');
      }
    }
  }, []);

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('mathtest_theme', next);
      document.documentElement.setAttribute('data-theme', next);
    }
  }

  // Initialize remembered name and class from localStorage
  // Initialize remembered name and class from localStorage and student token
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const p = new URLSearchParams(window.location.search);
    const t = (p.get('token') || '').trim();

    if (t) {
      setStudentToken(t);
      fetch(`/api/student/${encodeURIComponent(t)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const fetchedName = d?.student?.name || d?.studentName;
          const fetchedClass = d?.student?.className || d?.className || '';
          if (fetchedName) {
            setName(fetchedName);
            if (fetchedClass) setClassName(fetchedClass);
            setStudentLocked(true);
            try {
              localStorage.setItem('math_last_student_name', fetchedName);
              if (fetchedClass) localStorage.setItem('math_last_student_class', fetchedClass);
            } catch {}
          }
        })
        .catch(() => {});
    } else {
      const storedName = localStorage.getItem('math_last_student_name') || '';
      const storedClass = localStorage.getItem('math_last_student_class') || '';
      const storedParentLink = localStorage.getItem('math_parent_link') || '';

      if (storedName && !name) setName(storedName);
      if (storedClass && !className) setClassName(storedClass);
      if (storedParentLink) setSavedParentLink(storedParentLink);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Question order: shuffled per attempt when the teacher enabled it
  const questions: PublicQuestion[] = useMemo(() => {
    if (!ex) return [];
    if (ex.shuffleQuestions && attempt) return seededShuffle(ex.questions, attempt.attemptId);
    return ex.questions;
  }, [ex, attempt?.attemptId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load exercise and conditionally resume an in-progress attempt or completed submission
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = new URLSearchParams(window.location.search);
        const urlToken = (p.get('token') || '').trim();
        const fetchUrl = urlToken
          ? `/api/exercises/${id}?token=${encodeURIComponent(urlToken)}`
          : `/api/exercises/${id}`;

        const res = await fetch(fetchUrl);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || 'Exercise not found.');
          return setPhase('error');
        }
        setEx(data.exercise);

        if (data.student?.name) {
          setName(data.student.name);
          if (data.student.className) setClassName(data.student.className);
          setStudentLocked(true);
          try {
            localStorage.setItem('math_last_student_name', data.student.name);
            if (data.student.className) localStorage.setItem('math_last_student_class', data.student.className);
          } catch {}
        }

        // If student has already completed this exercise, show result view directly!
        if (data.submission) {
          setResult({
            score: data.submission.score,
            total: data.submission.total,
            late: data.submission.late,
            details: data.submission.details,
            studentName: data.submission.studentName || name,
          });
          return setPhase('done');
        }

        if (data.closed) return setPhase('closed');

        try {
          const saved = localStorage.getItem(storeKey);
          if (saved) {
            const parsed = JSON.parse(saved) as Attempt;

            // Safety check: Don't restore if attempt belongs to a different student name
            const currentExpectedName = name.trim();
            const attemptName = (parsed.name || '').trim();

            const isMatchingStudent = !currentExpectedName || !attemptName ||
              currentExpectedName.toLowerCase() === attemptName.toLowerCase();

            // Also check if time limit already expired by a wide margin (avoid instant auto-submit on page load)
            const timeLimitMs = (data.exercise.timeLimitMinutes || 0) * 60_000;
            const isAlreadyExpired = timeLimitMs > 0 && (Date.now() - parsed.startedAt > timeLimitMs + 30_000);

            if (isMatchingStudent && !isAlreadyExpired && !urlToken) {
              setAttempt(parsed);
              return setPhase('taking');
            } else {
              // Stale or belongs to another student: clear it
              localStorage.removeItem(storeKey);
            }
          }
        } catch {
          localStorage.removeItem(storeKey);
        }
        setPhase('name');
      } catch {
        if (!cancelled) {
          setError('Could not load the exercise. Check your connection.');
          setPhase('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, storeKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
        const claimSecret = a.claimSecret || localStorage.getItem('math_claim_secret') || '';
        const profileId = a.profileId || localStorage.getItem('math_profile_id') || '';

        const res = await fetch(`/api/exercises/${id}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            attemptId: a.attemptId,
            answers: a.answers,
            profileId,
            claimSecret,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Submit failed');
        try {
          localStorage.removeItem(storeKey);
        } catch {}

        if (data.parentLink) {
          localStorage.setItem('math_parent_link', data.parentLink);
          setSavedParentLink(data.parentLink);
        }

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

  // Countdown timer (uses server clock offset)
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

    // Remember name and class in localStorage
    try {
      localStorage.setItem('math_last_student_name', name.trim());
      if (className.trim()) {
        localStorage.setItem('math_last_student_class', className.trim());
      } else {
        localStorage.removeItem('math_last_student_class');
      }
    } catch {}

    const storedClaimSecret = localStorage.getItem('math_claim_secret') || '';

    try {
      const res = await fetch(`/api/exercises/${id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: name.trim(),
          className: className.trim() || undefined,
          claimSecret: storedClaimSecret || undefined,
          ...(studentToken ? { studentToken } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not start.');

      // Save claim secret if issued
      if (data.claimSecret) {
        localStorage.setItem('math_claim_secret', data.claimSecret);
      }
      if (data.profileId) {
        localStorage.setItem('math_profile_id', data.profileId);
      }

      const a: Attempt = {
        attemptId: data.attemptId,
        startedAt: data.startedAt,
        clockOffset: data.serverNow - Date.now(),
        name: name.trim(),
        className: className.trim() || undefined,
        profileId: data.profileId,
        claimSecret: data.claimSecret || storedClaimSecret || undefined,
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

  async function handleShareToParent() {
    if (!result?.parentLink) return;
    const studentDisplayName = attempt?.name || name || 'កូន';
    const shareText = `សួស្តី! នេះជាតំណដើម្បីមើលលទ្ធផលរបស់ ${studentDisplayName}៖`;

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        // The share sheet takes focus from the page; do not treat that as a screenshot attempt
        await withGuardPausedAsync(() =>
          navigator.share({
            title: 'លទ្ធផលលំហាត់គណិតវិទ្យា',
            text: shareText,
            url: result.parentLink,
          })
        );
        return;
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          handleCopyParentLink();
        }
      }
    } else {
      handleCopyParentLink();
    }
  }

  function handleCopyParentLink() {
    const link = result?.parentLink || savedParentLink;
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopiedParentLink(true);
    setTimeout(() => setCopiedParentLink(false), 2500);
  }

  const ThemeToggle = (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle dark / light theme"
      title={theme === 'light' ? 'Switch to Dark Mode (ពន្លឺងងឹត)' : 'Switch to Light Mode (ពន្លឺភ្លឺ)'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 38,
        height: 38,
        borderRadius: 10,
        border: '1px solid var(--theme-border)',
        backgroundColor: 'var(--theme-card-bg)',
        color: 'var(--theme-navy)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        flexShrink: 0,
      }}
    >
      {theme === 'light' ? <Moon size={18} /> : <Sun size={18} style={{ color: '#f59e0b' }} />}
    </button>
  );

  if (phase === 'loading') {
    return (
      <div className="wrap" style={{ maxWidth: 520, textAlign: 'center', paddingTop: 80 }}>
        <div style={{ fontSize: '1.2rem', color: 'var(--theme-muted)', fontWeight: 600 }}>
          កំពុងផ្ទុកលំហាត់… / Loading exercise…
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="wrap" style={{ maxWidth: 520, paddingTop: 60 }}>
        <div className="card error stack" style={{ padding: 24, textAlign: 'center', backgroundColor: 'var(--theme-card-bg)', border: '1px solid var(--theme-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>{ThemeToggle}</div>
          <h2 style={{ margin: '4px 0', fontSize: '1.25rem', color: 'var(--bad)' }}>មានបញ្ហា / Error</h2>
          <p style={{ margin: 0, color: 'var(--theme-muted)' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!ex) return null;

  if (phase === 'closed') {
    return (
      <div className="wrap" style={{ maxWidth: 520, paddingTop: 60 }}>
        <div className="card stack" style={{ padding: 24, textAlign: 'center', backgroundColor: 'var(--theme-card-bg)', border: '1px solid var(--theme-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>{ThemeToggle}</div>
          <h1 style={{ margin: '4px 0', fontSize: '1.4rem', color: 'var(--theme-navy)' }}>{ex.title}</h1>
          <p style={{ color: 'var(--theme-muted)' }}>លំហាត់នេះត្រូវបានបិទបញ្ចប់ហើយ (This exercise has closed)។</p>
        </div>
      </div>
    );
  }

  if (phase === 'name')
    return (
      <div className="wrap" style={{ maxWidth: 520, padding: '14px 12px 60px' }}>
        <form
          className="card stack"
          onSubmit={start}
          style={{
            backgroundColor: 'var(--theme-card-bg)',
            borderColor: 'var(--theme-border)',
            boxShadow: 'var(--theme-shadow)',
            padding: '16px 14px',
            borderRadius: 20,
          }}
        >
          {/* Header with Logo and Theme Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img
                src="/logo.png"
                alt="Math Exercises"
                style={{ height: 46, width: 'auto', objectFit: 'contain' }}
              />
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--theme-muted)' }}>
                លំហាត់គណិតវិទ្យា
              </span>
            </div>
            {ThemeToggle}
          </div>

          <div style={{ textAlign: 'center' }}>
            <h1 style={{ margin: '4px 0', fontSize: '1.2rem', fontWeight: 800, color: 'var(--theme-navy)' }}>
              {ex.title}
            </h1>
            {ex.isSample && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 12px',
                  borderRadius: 20,
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  color: '#059669',
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  marginTop: 4,
                }}
              >
                🌟 លំហាត់សាកល្បងឥតគិតថ្លៃ (Free Sample Exercise)
              </span>
            )}
          </div>

          {ex.description && (
            <div style={{ textAlign: 'center', color: 'var(--theme-muted)', fontSize: '0.92rem', lineHeight: 1.5 }}>
              <MathText text={ex.description} />
            </div>
          )}

          <div
            style={{
              textAlign: 'center',
              fontSize: '0.88rem',
              color: 'var(--theme-muted)',
              backgroundColor: 'var(--theme-page-bg)',
              padding: '8px 12px',
              borderRadius: 10,
              border: '1px solid var(--theme-border-subtle)',
            }}
          >
            📋 {ex.questions.length} សំណួរ
            {ex.timeLimitMinutes ? ` · ⏱ រយៈពេល ${ex.timeLimitMinutes} នាទី (នាឡិកានឹងចាប់ផ្ដើមពេលចុច ចាប់ផ្ដើម)` : ''}
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 700, marginBottom: 6, fontSize: '0.92rem', color: 'var(--theme-navy)' }}>
              ឈ្មោះរបស់អ្នក {studentLocked ? '(ចាក់សោតាមបញ្ជីឈ្មោះ)' : ''} *
            </label>
            <input
              value={name}
              onChange={(e) => !studentLocked && setName(e.target.value)}
              maxLength={80}
              placeholder={ex.isSample ? 'បញ្ចូលឈ្មោះរបស់អ្នកដើម្បីចាប់ផ្ដើមភ្លាមៗ...' : 'បញ្ចូលឈ្មោះរបស់អ្នក...'}
              autoFocus={!studentLocked && !name}
              readOnly={studentLocked}
              style={{
                fontSize: '1rem',
                fontWeight: 600,
                padding: '9px 12px',
                borderRadius: 12,
                backgroundColor: studentLocked ? 'var(--theme-page-bg)' : 'var(--theme-card-bg)',
                color: 'var(--theme-navy)',
                border: '1.5px solid var(--theme-border)',
                cursor: studentLocked ? 'not-allowed' : 'text',
              }}
              required
            />
            {ex.isSample && !studentLocked && !name && (
              <span
                style={{
                  fontSize: '0.82rem',
                  marginTop: 6,
                  display: 'block',
                  color: '#059669',
                  fontWeight: 600,
                }}
              >
                💡 លំហាត់សាកល្បងឥតគិតថ្លៃ៖ គ្រាន់តែបញ្ចូលឈ្មោះរបស់អ្នក រួចចុចចាប់ផ្ដើមដើម្បីសាកល្បងភ្លាមៗ!
              </span>
            )}
            {!studentLocked && name && (
              <div style={{ marginTop: 4, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => {
                    setName('');
                    setClassName('');
                    try {
                      localStorage.removeItem('math_last_student_name');
                      localStorage.removeItem('math_last_student_class');
                      localStorage.removeItem(storeKey);
                    } catch {}
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--theme-muted)',
                    fontSize: '0.82rem',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  មិនមែន {name}? (ប្តូរឈ្មោះ / Not you?)
                </button>
              </div>
            )}
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


          {savedParentLink && (
            <div style={{ textAlign: 'center', paddingTop: 4 }}>
              <button
                type="button"
                onClick={() => setShowSavedParentModal(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--theme-primary)',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>📱 តំណឪពុកម្តាយរបស់ខ្ញុំ (My parent link)</span>
              </button>
            </div>
          )}

          {error && (
            <div className="error" style={{ marginBottom: 12 }}>
              <div>{error}</div>
              <div style={{ marginTop: 8, fontSize: '0.86rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Link
                  href="/student"
                  style={{ color: 'var(--theme-primary)', fontWeight: 800, textDecoration: 'underline' }}
                >
                  👉 ទៅកាន់មជ្ឈមណ្ឌលសិស្ស (Go to Student Portal)
                </Link>
                <Link
                  href={`/register?exerciseId=${id}`}
                  style={{ color: '#b91c1c', fontWeight: 800, textDecoration: 'underline' }}
                >
                  👉 ចុចទីនេះដើម្បីចុះឈ្មោះឈ្មោះ និងថ្នាក់ (Click here to register)
                </Link>
              </div>
            </div>
          )}

          <button
            className="btn"
            type="submit"
            disabled={busy || !name.trim()}
            style={{
              padding: '10px 16px',
              fontSize: '1rem',
              fontWeight: 800,
              borderRadius: 12,
              backgroundColor: ex.isSample ? '#10b981' : 'var(--theme-primary)',
              borderColor: ex.isSample ? '#10b981' : 'var(--theme-primary)',
              color: '#ffffff',
              boxShadow: ex.isSample ? '0 4px 14px rgba(16,185,129,0.3)' : '0 4px 14px rgba(37,99,235,0.25)',
              marginTop: 6,
              cursor: busy || !name.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? 'កំពុងចាប់ផ្ដើម…' : (ex.isSample ? '🌟 ចាប់ផ្ដើមធ្វើលំហាត់សាកល្បង' : 'ចាប់ផ្ដើមធ្វើលំហាត់')}
          </button>

          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <Link
              href={`/register?exerciseId=${id}`}
              style={{
                color: 'var(--theme-primary)',
                fontWeight: 700,
                fontSize: '0.88rem',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>{ex.isSample ? '✨ ចង់ចុះឈ្មោះចូលរៀនវគ្គពេញលេញ? ចុះឈ្មោះនៅទីនេះ' : '✨ សិស្សថ្មីមិនទាន់បានចុះឈ្មោះ? ចុះឈ្មោះឈ្មោះ និងថ្នាក់ទីនេះ'}</span>
            </Link>
          </div>
        </form>

        {/* Saved Parent Link Modal on Name Screen */}
        {showSavedParentModal && savedParentLink && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(3px)',
              zIndex: 999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
            onClick={() => setShowSavedParentModal(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                backgroundColor: '#ffffff',
                borderRadius: 20,
                padding: '24px 20px',
                maxWidth: 400,
                width: '100%',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
                តំណឪពុកម្តាយរបស់អ្នក
              </h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                ឪពុកម្តាយអាចស្កេន ឬបើកតំណនេះដើម្បីតាមដានលទ្ធផលលំហាត់របស់អ្នក។
              </p>
              <div style={{ padding: 12, backgroundColor: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <QRCodeSVG value={savedParentLink} size={150} />
              </div>
              <div style={{ display: 'flex', gap: 8, width: '100%', marginTop: 6 }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(savedParentLink);
                    setCopiedParentLink(true);
                    setTimeout(() => setCopiedParentLink(false), 2000);
                  }}
                  style={{ flex: 1, borderRadius: 10, fontSize: '0.88rem' }}
                >
                  {copiedParentLink ? '✓ បានចម្លង!' : 'ចម្លងតំណភ្ជាប់'}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowSavedParentModal(false)}
                  style={{ borderRadius: 10, fontSize: '0.88rem' }}
                >
                  បិទ
                </button>
              </div>
            </div>
          </div>
        )}
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
      <>
      {/* The review shows every question with the correct answers, so it is guarded like the exercise itself */}
      <ScreenGuard studentName={attempt?.name || result.studentName || name || 'Student'} />
      <div className="wrap stack" style={{ maxWidth: 600, padding: '16px 12px 60px' }}>
        {/* Score summary card */}
        <div
          className="card"
          style={{
            padding: '18px 20px',
            borderRadius: 18,
            backgroundColor: 'var(--theme-card-bg)',
            border: '1px solid var(--theme-border)',
            boxShadow: 'var(--theme-shadow)',
          }}
        >
          <div className="row spread" style={{ alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img
                src="/logo.png"
                alt="Math Logo"
                style={{ height: 44, width: 'auto', objectFit: 'contain' }}
              />
              <div>
                <h1 style={{ margin: 0, fontSize: '1.25rem', lineHeight: 1.3, fontWeight: 800, color: 'var(--theme-navy)' }}>
                  លទ្ធផល{(attempt?.name || result.studentName || name) ? `: ${attempt?.name || result.studentName || name}` : ''}
                </h1>
                <div style={{ fontSize: '0.85rem', color: 'var(--theme-muted)' }}>
                  បានបញ្ចប់ការធ្វើតេស្ត
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '1.8rem', fontWeight: 800, color: percentage >= 50 ? (theme === 'dark' ? '#34d399' : '#059669') : (theme === 'dark' ? '#f87171' : '#dc2626') }}>
                  {result.score}/{result.total}
                </span>
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--theme-muted)', marginLeft: 4 }}>
                  ({percentage}%)
                </span>
              </div>
              {ThemeToggle}
            </div>
          </div>

          {result.late && (
            <div
              className="notice"
              style={{
                padding: '8px 12px',
                fontSize: '0.88rem',
                marginBottom: 10,
                borderRadius: 10,
                backgroundColor: theme === 'dark' ? 'rgba(217, 119, 6, 0.18)' : '#fffbeb',
                color: theme === 'dark' ? '#fbbf24' : '#b45309',
                border: theme === 'dark' ? '1px solid rgba(217, 119, 6, 0.35)' : '1px solid #fde68a',
              }}
            >
              ⚠️ អ្នកបានបញ្ជូនចម្លើយហួសកំណត់ពេលវេលា។
            </div>
          )}

          {/* Correct vs Incorrect Quick Stats in 1 row */}
          <div className="row" style={{ gap: 10, marginTop: 4 }}>
            <div
              style={{
                flex: 1,
                background: theme === 'dark' ? 'rgba(5, 150, 105, 0.18)' : '#ecfdf5',
                border: theme === 'dark' ? '1px solid rgba(5, 150, 105, 0.35)' : '1px solid #a7f3d0',
                borderRadius: 10,
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: '0.85rem', color: theme === 'dark' ? '#6ee7b7' : '#065f46', fontWeight: 700 }}>✓ ត្រឹមត្រូវ</span>
              <strong style={{ fontSize: '1.2rem', color: theme === 'dark' ? '#34d399' : '#047857' }}>{correctCount}</strong>
            </div>
            <div
              style={{
                flex: 1,
                background: theme === 'dark' ? 'rgba(220, 38, 38, 0.18)' : '#fef2f2',
                border: theme === 'dark' ? '1px solid rgba(220, 38, 38, 0.35)' : '1px solid #fecaca',
                borderRadius: 10,
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: '0.85rem', color: theme === 'dark' ? '#fca5a5' : '#991b1b', fontWeight: 700 }}>✗ មិនត្រឹមត្រូវ</span>
              <strong style={{ fontSize: '1.2rem', color: theme === 'dark' ? '#f87171' : '#b91c1c' }}>{incorrectCount}</strong>
            </div>
          </div>
        </div>

        {/* 2. SEND TO PARENT CARD (only if device is verified owner and parentLink returned) */}
        {result.parentLink && (
          <div
            className="card"
            style={{
              padding: '22px 20px',
              borderRadius: 18,
              backgroundColor: theme === 'dark' ? 'rgba(37, 99, 235, 0.14)' : '#eff6ff',
              border: theme === 'dark' ? '2px solid rgba(59, 130, 246, 0.4)' : '2px solid #bfdbfe',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 14,
              boxShadow: 'var(--theme-shadow)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: theme === 'dark' ? '#93c5fd' : '#1e40af' }}>
              <span style={{ fontSize: '1.5rem' }}>👨‍👩‍👧‍👦</span>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>
                ផ្ញើលទ្ធផលទៅឪពុកម្តាយ
              </h3>
            </div>

            <p style={{ margin: 0, fontSize: '0.92rem', color: theme === 'dark' ? '#bfdbfe' : '#1e3a8a', maxWidth: 440, lineHeight: 1.5 }}>
              ឪពុកម្តាយអាចតាមដានលទ្ធផលទាំងអស់របស់កូនបានភ្លាមៗ ដោយមិនបាច់ចុះឈ្មោះ ឬប្រើអ៊ីមែលឡើយ។
            </p>

            {/* Primary Share Button */}
            <button
              type="button"
              className="btn"
              onClick={handleShareToParent}
              style={{
                width: '100%',
                maxWidth: 380,
                backgroundColor: 'var(--theme-primary)',
                borderColor: 'var(--theme-primary)',
                borderRadius: 12,
                padding: '12px 18px',
                fontSize: '1.05rem',
                fontWeight: 800,
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(37,99,235,0.25)',
              }}
            >
              <span>📤</span>
              <span>ផ្ញើទៅឪពុកម្តាយ (Share to Parents)</span>
            </button>

            {/* Companion buttons: Copy Link & Show QR */}
            <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 380, justifyContent: 'center' }}>
              <button
                type="button"
                className="btn secondary"
                onClick={handleCopyParentLink}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  padding: '9px 12px',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  backgroundColor: 'var(--theme-card-bg)',
                  borderColor: 'var(--theme-border)',
                  color: 'var(--theme-navy)',
                }}
              >
                {copiedParentLink ? '✓ បានចម្លង!' : '📋 ចម្លងតំណ (Copy link)'}
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setShowResultQr(!showResultQr)}
                style={{
                  borderRadius: 10,
                  padding: '9px 12px',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  backgroundColor: 'var(--theme-card-bg)',
                  borderColor: 'var(--theme-border)',
                  color: 'var(--theme-navy)',
                }}
              >
                📷 {showResultQr ? 'លាក់ QR' : 'បង្ហាញ QR Code'}
              </button>
            </div>

            {/* Expandable QR Code */}
            {showResultQr && (
              <div
                style={{
                  padding: 16,
                  backgroundColor: '#ffffff',
                  borderRadius: 14,
                  border: '1px solid #cbd5e1',
                  marginTop: 6,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                }}
              >
                <QRCodeSVG value={result.parentLink} size={150} />
                <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                  ស្កេនពីអេក្រង់នេះដើម្បីបើកមើលលទ្ធផល
                </span>
              </div>
            )}

            <div style={{ fontSize: '0.8rem', color: 'var(--theme-muted)', fontStyle: 'italic', marginTop: 2 }}>
              🔒 កុំចែករំលែកតំណនេះជាមួយអ្នកផ្សេង (Do not share this private link)
            </div>
          </div>
        )}

        {/* Tab Filters */}
        <div className="row" style={{ gap: 8 }}>
          <button
            type="button"
            className={`result-tab-btn ${resultTab === 'all' ? 'active' : ''}`}
            onClick={() => setResultTab('all')}
            style={{
              padding: '8px 14px',
              borderRadius: 10,
              fontSize: '0.88rem',
              fontWeight: 700,
              border: '1px solid var(--theme-border)',
              backgroundColor: resultTab === 'all' ? 'var(--theme-primary)' : 'var(--theme-card-bg)',
              color: resultTab === 'all' ? '#ffffff' : 'var(--theme-navy)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>ទាំងអស់</span>
            <span style={{ fontSize: '0.8rem', opacity: 0.85 }}>({result.details.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setResultTab('incorrect')}
            style={{
              padding: '8px 14px',
              borderRadius: 10,
              fontSize: '0.88rem',
              fontWeight: 700,
              border: resultTab === 'incorrect' ? '1px solid #dc2626' : '1px solid var(--theme-border)',
              backgroundColor: resultTab === 'incorrect' ? '#dc2626' : 'var(--theme-card-bg)',
              color: resultTab === 'incorrect' ? '#ffffff' : 'var(--theme-navy)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>មិនត្រូវ</span>
            <span
              style={{
                fontSize: '0.8rem',
                padding: '2px 6px',
                borderRadius: 999,
                backgroundColor: resultTab === 'incorrect' ? '#ffffff' : (theme === 'dark' ? 'rgba(220,38,38,0.2)' : '#fee2e2'),
                color: resultTab === 'incorrect' ? '#dc2626' : '#dc2626',
                fontWeight: 800,
              }}
            >
              {incorrectCount}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setResultTab('correct')}
            style={{
              padding: '8px 14px',
              borderRadius: 10,
              fontSize: '0.88rem',
              fontWeight: 700,
              border: resultTab === 'correct' ? '1px solid #059669' : '1px solid var(--theme-border)',
              backgroundColor: resultTab === 'correct' ? '#059669' : 'var(--theme-card-bg)',
              color: resultTab === 'correct' ? '#ffffff' : 'var(--theme-navy)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>ត្រឹមត្រូវ</span>
            <span
              style={{
                fontSize: '0.8rem',
                padding: '2px 6px',
                borderRadius: 999,
                backgroundColor: resultTab === 'correct' ? '#ffffff' : (theme === 'dark' ? 'rgba(5,150,105,0.2)' : '#d1fae5'),
                color: resultTab === 'correct' ? '#059669' : '#059669',
                fontWeight: 800,
              }}
            >
              {correctCount}
            </span>
          </button>
        </div>

        {/* Questions list */}
        {displayedQuestions.map(({ q, originalIndex, detail }) => {
          if (!detail) return null;
          const isCorrect = detail.correct;

          return (
            <div
              key={q.id}
              className="card stack"
              style={{
                padding: '16px 18px',
                borderRadius: 14,
                backgroundColor: 'var(--theme-card-bg)',
                border: '1px solid var(--theme-border)',
                borderLeft: `5px solid ${isCorrect ? (theme === 'dark' ? '#34d399' : '#059669') : (theme === 'dark' ? '#f87171' : '#dc2626')}`,
                boxShadow: 'var(--theme-shadow)',
              }}
            >
              <div className="row spread" style={{ alignItems: 'flex-start' }}>
                <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--theme-navy)' }}>
                  សំណួរទី {originalIndex}
                </span>
                <span
                  style={{
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    padding: '3px 10px',
                    borderRadius: 999,
                    backgroundColor: isCorrect
                      ? (theme === 'dark' ? 'rgba(5, 150, 105, 0.2)' : '#ecfdf5')
                      : (theme === 'dark' ? 'rgba(220, 38, 38, 0.2)' : '#fef2f2'),
                    color: isCorrect
                      ? (theme === 'dark' ? '#34d399' : '#047857')
                      : (theme === 'dark' ? '#f87171' : '#b91c1c'),
                  }}
                >
                  {detail.earned} / {q.points} ពិន្ទុ
                </span>
              </div>

              <div style={{ fontSize: '1.1rem', lineHeight: 1.6, color: 'var(--theme-navy)', marginTop: 4 }}>
                <MathText text={q.prompt} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.95rem', marginTop: 6 }}>
                <div>
                  <span style={{ color: 'var(--theme-muted)' }}>ចម្លើយរបស់អ្នក៖ </span>
                  <strong style={{ color: isCorrect ? (theme === 'dark' ? '#34d399' : '#047857') : (theme === 'dark' ? '#f87171' : '#b91c1c') }}>
                    <MathText text={detail.given || '(មិនបានឆ្លើយ)'} />
                  </strong>
                </div>

                {!isCorrect && detail.correctAnswer && (
                  <div>
                    <span style={{ color: 'var(--theme-muted)' }}>ចម្លើយត្រឹមត្រូវ៖ </span>
                    <strong style={{ color: theme === 'dark' ? '#34d399' : '#047857' }}>
                      <MathText text={detail.correctAnswer} />
                    </strong>
                  </div>
                )}
              </div>

              {detail.explanation && (
                <div
                  style={{
                    marginTop: 8,
                    padding: '10px 14px',
                    borderRadius: 10,
                    backgroundColor: 'var(--theme-page-bg)',
                    border: '1px solid var(--theme-border)',
                    fontSize: '0.92rem',
                    color: 'var(--theme-navy)',
                    lineHeight: 1.5,
                  }}
                >
                  <div style={{ fontWeight: 800, color: 'var(--theme-primary)', marginBottom: 4 }}>
                    ការពន្យល់៖
                  </div>
                  <MathText text={detail.explanation} />
                </div>
              )}
            </div>
          );
        })}

        {/* Action navigation buttons at the end of results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.removeItem(storeKey);
              } catch {}
              setAttempt(null);
              setResult(null);
              setPhase('name');
            }}
            style={{
              padding: '12px 18px',
              borderRadius: 12,
              fontWeight: 800,
              fontSize: '0.95rem',
              backgroundColor: 'var(--theme-card-bg)',
              color: 'var(--theme-primary)',
              border: '1.5px solid var(--theme-primary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <span>🔄</span>
            <span>ធ្វើលំហាត់នេះម្តងទៀត ឬប្តូរសិស្ស (Retake / Switch Student)</span>
          </button>

          {studentToken && (
            <Link
              href={`/s/${studentToken}`}
              style={{
                padding: '12px 18px',
                borderRadius: 12,
                fontWeight: 800,
                fontSize: '0.95rem',
                backgroundColor: 'var(--theme-primary)',
                color: '#ffffff',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                textAlign: 'center',
              }}
            >
              <span>🏠</span>
              <span>ត្រឡប់ទៅមជ្ឈមណ្ឌលសិស្សរបស់ខ្ញុំ (Back to My Portal)</span>
            </Link>
          )}
        </div>
      </div>
      </>
    );
  }

  // Phase === 'taking'
  return (
    <>
      <ScreenGuard studentName={attempt?.name || name || 'Student'} />
      <div className="wrap stack quiz-taking" style={{ maxWidth: 680, padding: '10px 10px 70px' }}>
        {/* Sticky Header with Timer, Theme Toggle & Submit button */}
        <div
          style={{
            position: 'sticky',
            top: 6,
            zIndex: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            borderRadius: 12,
            backgroundColor: 'var(--theme-card-bg)',
            border: '1px solid var(--theme-border)',
            boxShadow: 'var(--theme-shadow)',
            backdropFilter: 'blur(8px)',
            gap: 8,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: '0.78rem',
                color: 'var(--theme-muted)',
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              សិស្ស៖ <strong style={{ color: 'var(--theme-navy)' }}>{attempt?.name}</strong> {attempt?.className ? `(${attempt.className})` : ''}
            </div>
            {remaining !== null && (
              <div
                style={{
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  fontVariantNumeric: 'tabular-nums',
                  color: remaining < 60_000 ? '#ef4444' : 'var(--theme-navy)',
                }}
              >
                ⏱ {fmt(remaining)}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {ThemeToggle}
            <button
              type="button"
              className="btn small"
              disabled={busy}
              onClick={() => attempt && submit(attempt)}
              style={{
                padding: '7px 12px',
                borderRadius: 10,
                fontWeight: 800,
                fontSize: '0.85rem',
                backgroundColor: 'var(--theme-primary)',
                borderColor: 'var(--theme-primary)',
                color: '#ffffff',
                cursor: 'pointer',
              }}
            >
              {busy ? 'កំពុងបញ្ជូន…' : 'បញ្ជូនចម្លើយ'}
            </button>
          </div>
        </div>

        <h1 style={{ margin: '8px 0 2px', fontSize: '1.15rem', fontWeight: 800, color: 'var(--theme-navy)' }}>
          {ex.title}
        </h1>
        {ex.description && (
          <div style={{ color: 'var(--theme-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
            <MathText text={ex.description} />
          </div>
        )}

        {error && <div className="error">{error}</div>}

        {/* Questions list */}
        {questions.map((q, idx) => {
          const val = attempt?.answers[q.id] ?? '';

          return (
            <div
              key={q.id}
              className="card stack"
              style={{
                padding: '12px 12px',
                borderRadius: 12,
                backgroundColor: 'var(--theme-card-bg)',
                border: '1px solid var(--theme-border)',
                boxShadow: 'var(--theme-shadow)',
              }}
            >
              <div className="row spread" style={{ alignItems: 'baseline' }}>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '2px 9px',
                    borderRadius: 999,
                    backgroundColor: 'var(--theme-page-bg)',
                    border: '1px solid var(--theme-border)',
                    color: 'var(--theme-navy)',
                  }}
                >
                  សំណួរទី {idx + 1}
                </span>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--theme-muted)' }}>
                  {q.points} ពិន្ទុ
                </span>
              </div>

              <div
                style={{
                  fontSize: '1.05rem',
                  fontWeight: 600,
                  lineHeight: 1.55,
                  color: 'var(--theme-navy)',
                  marginTop: 4,
                  wordBreak: 'break-word',
                  overflowWrap: 'break-word',
                }}
              >
                <MathText text={q.prompt} />
              </div>

              {q.kind === 'choice' && q.choices ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
                  {q.choices.map((c, cIdx) => {
                    const checked = val === String(cIdx);
                    return (
                      <div
                        key={cIdx}
                        className={`choice-item ${checked ? 'selected' : ''}`}
                        onClick={() => setAnswer(q.id, String(cIdx))}
                        role="radio"
                        aria-checked={checked}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === ' ' || e.key === 'Enter') {
                            e.preventDefault();
                            setAnswer(q.id, String(cIdx));
                          }
                        }}
                      >
                        <div className="choice-circle-wrap">
                          <div className={`choice-circle ${checked ? 'active' : ''}`}>
                            <div className="choice-dot" />
                          </div>
                        </div>
                        <div
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: '1rem',
                            fontWeight: checked ? 700 : 500,
                            color: checked ? 'var(--theme-primary)' : 'var(--theme-navy)',
                            transition: 'color 0.12s ease',
                          }}
                        >
                          <ChoiceText choice={c} index={cIdx} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  {/* Symbol Quick Bar */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {SYMBOLS.map((sym) => (
                      <button
                        key={sym}
                        type="button"
                        onClick={() => insertSymbol(q.id, sym)}
                        style={{
                          padding: '4px 9px',
                          borderRadius: 8,
                          border: '1px solid var(--theme-border)',
                          backgroundColor: 'var(--theme-page-bg)',
                          color: 'var(--theme-navy)',
                          fontSize: '0.95rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {sym}
                      </button>
                    ))}
                  </div>

                  <input
                    ref={(el) => {
                      inputs.current[q.id] = el;
                    }}
                    value={val}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                    placeholder="បញ្ចូលចម្លើយរបស់អ្នក..."
                    style={{
                      fontSize: '1rem',
                      fontWeight: 600,
                      padding: '9px 11px',
                      borderRadius: 10,
                      backgroundColor: 'var(--theme-card-bg)',
                      color: 'var(--theme-navy)',
                      border: '1.5px solid var(--theme-border)',
                      outline: 'none',
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}

        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => attempt && submit(attempt)}
            style={{
              padding: '10px 28px',
              fontSize: '1rem',
              fontWeight: 800,
              backgroundColor: 'var(--theme-primary)',
              borderColor: 'var(--theme-primary)',
              color: '#ffffff',
              borderRadius: 12,
              boxShadow: '0 4px 14px rgba(37,99,235,0.25)',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? 'កំពុងបញ្ជូន…' : 'បញ្ជូនចម្លើយទាំងអស់'}
          </button>
        </div>
      </div>
    </>
  );
}
