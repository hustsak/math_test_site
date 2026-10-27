'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  UserPlus,
  CheckCircle2,
  BookOpen,
  ArrowRight,
  Sun,
  Moon,
  School,
  Sparkles,
  Calendar,
  AlertCircle,
  HelpCircle,
  Copy,
  Check,
} from 'lucide-react';

function StudentRegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnExerciseId = searchParams.get('exerciseId') || searchParams.get('exId') || '';

  // Theme state
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Form states
  const [name, setName] = useState('');
  const [grade, setGrade] = useState<number>(7);
  const [className, setClassName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Success state
  const [registeredStudent, setRegisteredStudent] = useState<{
    name: string;
    grade: number;
    className: string | null;
    expirationDate: string;
    studentToken?: string;
    paymentStatus?: 'approved' | 'pending';
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Sync theme
  useEffect(() => {
    const saved = localStorage.getItem('mathtest_theme') as 'light' | 'dark' | null;
    if (saved) {
      setTheme(saved);
      document.documentElement.setAttribute('data-theme', saved);
    }
    // Prefill from localStorage if available
    const lastStudent = localStorage.getItem('mathtest_student_name') || localStorage.getItem('math_last_student_name');
    if (lastStudent && !name) {
      setName(lastStudent);
    }
    const lastClass = localStorage.getItem('mathtest_class_name') || localStorage.getItem('math_last_student_class');
    if (lastClass && !className) {
      setClassName(lastClass);
    }
  }, []);

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('mathtest_theme', next);
    document.documentElement.setAttribute('data-theme', next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('សូមបញ្ចូលឈ្មោះសិស្ស (Please enter your name).');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/student/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          grade,
          className: className.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Registration failed. Please try again.');
      }

      // Save in localStorage so subsequent exercise visits recognize the student
      try {
        localStorage.setItem('mathtest_student_name', name.trim());
        localStorage.setItem('math_last_student_name', name.trim());
        if (className.trim()) {
          localStorage.setItem('mathtest_class_name', className.trim());
          localStorage.setItem('math_last_student_class', className.trim());
        }
      } catch {}

      setRegisteredStudent({
        name: data.student?.name || name.trim(),
        grade: data.student?.grade || grade,
        className: data.student?.className || className.trim() || null,
        expirationDate: data.student?.expirationDate || '',
        studentToken: data.studentToken || data.student?.studentToken || '',
        paymentStatus: data.student?.paymentStatus || 'pending',
      });
    } catch (err: any) {
      setError(err?.message || 'Error registering student.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="app-shell" style={{ minHeight: '100vh', padding: '24px 16px 80px' }}>
      <div style={{ maxWidth: 520, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Header Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/student" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <img src="/logo.png" alt="Math Logo" style={{ height: 42, width: 'auto', objectFit: 'contain' }} />
            <div>
              <span style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--theme-navy)', display: 'block', lineHeight: 1.2 }}>
                MathTest
              </span>
              <span style={{ fontSize: '0.76rem', color: 'var(--theme-muted)' }}>
                លំហាត់គណិតវិទ្យា ថ្នាក់ទី ៧-១២
              </span>
            </div>
          </Link>

          <button
            type="button"
            onClick={toggleTheme}
            className="btn small secondary"
            style={{ borderRadius: 10, padding: '7px 10px' }}
            aria-label="Toggle theme"
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        </div>

        {/* ========================================================================= */}
        {/* SUCCESS CARD */}
        {/* ========================================================================= */}
        {registeredStudent ? (
          <div
            style={{
              backgroundColor: 'var(--theme-card-bg)',
              borderRadius: 22,
              padding: '32px 24px',
              border: '1px solid var(--theme-border)',
              boxShadow: 'var(--theme-shadow)',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
            }}
          >
            <div
              style={{
                width: 68,
                height: 68,
                borderRadius: 22,
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                color: '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto',
              }}
            >
              <CheckCircle2 size={38} />
            </div>

            <div>
              <h2 style={{ margin: '0 0 6px 0', fontSize: '1.45rem', fontWeight: 900, color: 'var(--theme-navy)' }}>
                🎉 ចុះឈ្មោះបានជោគជ័យ!
              </h2>
              <p style={{ margin: 0, fontSize: '0.92rem', color: 'var(--theme-muted)' }}>
                Registration Successful
              </p>
            </div>

            {/* Profile summary card */}
            <div
              style={{
                backgroundColor: 'var(--theme-page-bg)',
                borderRadius: 16,
                padding: '16px 18px',
                border: '1px solid var(--theme-border)',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.92rem' }}>
                <span style={{ color: 'var(--theme-muted)' }}>ឈ្មោះសិស្ស (Name) ៖</span>
                <strong style={{ color: 'var(--theme-navy)' }}>{registeredStudent.name}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.92rem' }}>
                <span style={{ color: 'var(--theme-muted)' }}>កម្រិតថ្នាក់ (Grade) ៖</span>
                <span
                  style={{
                    backgroundColor: 'rgba(74, 103, 214, 0.12)',
                    color: 'var(--brand)',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: 6,
                    fontSize: '0.82rem',
                  }}
                >
                  ថ្នាក់ទី {registeredStudent.grade} (Grade {registeredStudent.grade})
                </span>
              </div>
              {registeredStudent.className && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.92rem' }}>
                  <span style={{ color: 'var(--theme-muted)' }}>ថ្នាក់ (Class) ៖</span>
                  <strong style={{ color: 'var(--theme-navy)' }}>{registeredStudent.className}</strong>
                </div>
              )}
              {registeredStudent.expirationDate && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', borderTop: '1px solid var(--theme-border)', paddingTop: 8 }}>
                  <span style={{ color: 'var(--theme-muted)' }}>សុពលភាព (Valid until) ៖</span>
                  <span style={{ color: '#059669', fontWeight: 700 }}>
                    📅 {registeredStudent.expirationDate} (Asia/Phnom_Penh)
                  </span>
                </div>
              )}
            </div>

            {/* Student's Unique Personal Link Card */}
            {registeredStudent.studentToken && (
              <div
                style={{
                  backgroundColor: 'rgba(74, 103, 214, 0.08)',
                  border: '1.5px solid rgba(74, 103, 214, 0.35)',
                  borderRadius: 16,
                  padding: '16px 18px',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--theme-navy)' }}>
                    🔗 តំណផ្ទាល់ខ្លួនរបស់អ្នក (Your Personal Access Link)
                  </span>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      backgroundColor: 'var(--brand)',
                      color: '#ffffff',
                      padding: '2px 7px',
                      borderRadius: 6,
                    }}
                  >
                    SAVE THIS LINK
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--theme-muted)', lineHeight: 1.4 }}>
                  អ្នកអាចរក្សាទុក ឬ Bookmark តំណនេះដើម្បីចូលធ្វើលំហាត់ដោយផ្ទាល់បានគ្រប់ពេលវេលាដោយមិនបាច់វាយឈ្មោះម្ដងទៀតឡើយ!
                </p>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    backgroundColor: 'var(--theme-page-bg)',
                    borderRadius: 10,
                    padding: '8px 12px',
                    border: '1px solid var(--theme-border)',
                  }}
                >
                  <input
                    type="text"
                    readOnly
                    value={typeof window !== 'undefined' ? `${window.location.origin}/s/${registeredStudent.studentToken}` : `/s/${registeredStudent.studentToken}`}
                    style={{
                      border: 'none',
                      background: 'none',
                      outline: 'none',
                      fontSize: '0.84rem',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      color: 'var(--theme-primary)',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const url = `${window.location.origin}/s/${registeredStudent.studentToken}`;
                      navigator.clipboard.writeText(url);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2500);
                    }}
                    className="btn small"
                    style={{
                      padding: '5px 12px',
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: '0.8rem',
                      backgroundColor: copiedLink ? '#059669' : 'var(--theme-primary)',
                      borderColor: copiedLink ? '#059669' : 'var(--theme-primary)',
                      color: '#ffffff',
                    }}
                  >
                    {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedLink ? 'បានចម្លង!' : 'ចម្លងតំណ (Copy)'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Payment Approval Notice */}
            {registeredStudent.paymentStatus === 'pending' ? (
              <div
                style={{
                  backgroundColor: 'rgba(234, 88, 12, 0.08)',
                  border: '1px solid rgba(234, 88, 12, 0.3)',
                  borderRadius: 14,
                  padding: '14px 16px',
                  textAlign: 'left',
                  fontSize: '0.88rem',
                  color: 'var(--theme-navy)',
                  lineHeight: 1.5,
                }}
              >
                <span style={{ fontWeight: 800, color: '#ea580c', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span>⏳</span>
                  <span>រង់ចាំការអនុម័តបង់ប្រាក់ (Pending Payment Approval)</span>
                </span>
                បច្ចុប្បន្នអ្នកអាចចូលធ្វើ<strong>លំហាត់សាកល្បងឥតគិតថ្លៃ (Sample Test Exercises)</strong> បានភ្លាមៗ។ បន្ទាប់ពីលោកគ្រូបានអនុម័តការបង់ប្រាក់រួច អ្នកនឹងអាចចូលធ្វើលំហាត់ទាំងអស់បានដោយស្វ័យប្រវត្តិ!
              </div>
            ) : (
              /* Crucial Instruction for Next Exercises */
              <div
                style={{
                  backgroundColor: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  borderRadius: 14,
                  padding: '14px 16px',
                  textAlign: 'left',
                  fontSize: '0.88rem',
                  color: 'var(--theme-navy)',
                  lineHeight: 1.5,
                }}
              >
                <span style={{ fontWeight: 800, display: 'block', marginBottom: 4 }}>
                  💡 ចំណាំសំខាន់សម្រាប់ការចូលធ្វើលំហាត់ ៖
                </span>
                សម្រាប់លំហាត់បន្ទាប់ ឬលំហាត់បច្ចុប្បន្ន អ្នកគ្រាន់តែវាយបញ្ចូលឈ្មោះ «<strong>{registeredStudent.name}</strong>» ឬប្រើតំណផ្ទាល់ខ្លួនរបស់អ្នក នោះអ្នកនឹងអាចចូលធ្វើលំហាត់ និងមើលលទ្ធផលបានភ្លាមៗ!
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
              {returnExerciseId && (
                <Link
                  href={`/e/${returnExerciseId}`}
                  className="btn"
                  style={{
                    backgroundColor: 'var(--theme-primary)',
                    borderColor: 'var(--theme-primary)',
                    color: '#ffffff',
                    padding: '14px 20px',
                    borderRadius: 14,
                    fontWeight: 800,
                    fontSize: '1rem',
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    boxShadow: '0 4px 14px rgba(37,99,235,0.25)',
                  }}
                >
                  <BookOpen size={18} />
                  <span>ទៅកាន់លំហាត់ភ្លាមៗ (Start Exercise)</span>
                </Link>
              )}

              <Link
                href="/student"
                className="btn"
                style={{
                  backgroundColor: returnExerciseId ? 'var(--theme-page-bg)' : 'var(--theme-primary)',
                  borderColor: returnExerciseId ? 'var(--theme-border)' : 'var(--theme-primary)',
                  color: returnExerciseId ? 'var(--theme-navy)' : '#ffffff',
                  padding: '13px 20px',
                  borderRadius: 14,
                  fontWeight: 800,
                  fontSize: '0.98rem',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <span>ចូលទៅកាន់មជ្ឈមណ្ឌលសិស្ស (Go to Student Portal)</span>
                <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        ) : (
          /* ========================================================================= */
          /* REGISTRATION FORM */
          /* ========================================================================= */
          <div
            style={{
              backgroundColor: 'var(--theme-card-bg)',
              borderRadius: 22,
              padding: '30px 24px',
              border: '1px solid var(--theme-border)',
              boxShadow: 'var(--theme-shadow)',
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: 22 }}>
              <div
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: 18,
                  backgroundColor: 'rgba(74, 103, 214, 0.12)',
                  color: 'var(--theme-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 12px',
                }}
              >
                <UserPlus size={28} />
              </div>
              <h1 style={{ margin: '0 0 6px 0', fontSize: '1.4rem', fontWeight: 900, color: 'var(--theme-navy)' }}>
                ចុះឈ្មោះសិស្សថ្មី
              </h1>
              <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--theme-muted)' }}>
                New Student Registration — សម្រាប់ចូលធ្វើលំហាត់
              </p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {error && (
                <div
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#dc2626',
                    padding: '12px 14px',
                    borderRadius: 12,
                    fontSize: '0.88rem',
                    fontWeight: 700,
                  }}
                >
                  {error}
                </div>
              )}

              {/* Student Name */}
              <div>
                <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 800, color: 'var(--theme-navy)', marginBottom: 6 }}>
                  ឈ្មោះសិស្ស (Student Name) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="ឧ. ស៊ុន ដារ៉ា ឬ Sok Dara"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '13px 16px',
                    borderRadius: 12,
                    border: '1.5px solid var(--theme-border)',
                    backgroundColor: 'var(--theme-page-bg)',
                    color: 'var(--theme-navy)',
                    fontSize: '1rem',
                    fontWeight: 700,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  autoFocus
                />
                <span style={{ fontSize: '0.78rem', color: 'var(--theme-muted)', marginTop: 4, display: 'block' }}>
                  សូមចាំឈ្មោះនេះ ព្រោះអ្នកនឹងប្រើឈ្មោះនេះដើម្បីចូលធ្វើលំហាត់នៅថ្ងៃក្រោយ។
                </span>
              </div>

              {/* Grade Selection (7–12) */}
              <div>
                <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 800, color: 'var(--theme-navy)', marginBottom: 6 }}>
                  កម្រិតថ្នាក់ (Grade 7–12) *
                </label>
                <select
                  value={grade}
                  onChange={(e) => setGrade(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '13px 16px',
                    borderRadius: 12,
                    border: '1.5px solid var(--theme-border)',
                    backgroundColor: 'var(--theme-page-bg)',
                    color: 'var(--theme-navy)',
                    fontSize: '0.98rem',
                    fontWeight: 700,
                    outline: 'none',
                    boxSizing: 'border-box',
                    cursor: 'pointer',
                  }}
                >
                  {[7, 8, 9, 10, 11, 12].map((g) => (
                    <option key={g} value={g}>
                      ថ្នាក់ទី {g} (Grade {g})
                    </option>
                  ))}
                </select>

              </div>


              <button
                type="submit"
                disabled={submitting}
                className="btn"
                style={{
                  padding: '14px 20px',
                  borderRadius: 14,
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  backgroundColor: 'var(--theme-primary)',
                  borderColor: 'var(--theme-primary)',
                  color: '#ffffff',
                  boxShadow: '0 4px 14px rgba(37,99,235,0.25)',
                  marginTop: 6,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {submitting ? (
                  <span>កំពុងចុះឈ្មោះ… (Registering…)</span>
                ) : (
                  <>
                    <UserPlus size={18} />
                    <span>ចុះឈ្មោះ និងចូលធ្វើលំហាត់</span>
                  </>
                )}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--theme-border)' }}>
              <span style={{ fontSize: '0.86rem', color: 'var(--theme-muted)' }}>
                មានឈ្មោះក្នុងប្រព័ន្ធរួចហើយ?{' '}
              </span>
              <Link
                href="/student"
                style={{
                  color: 'var(--theme-primary)',
                  fontWeight: 800,
                  fontSize: '0.86rem',
                  textDecoration: 'none',
                }}
              >
                ចូលធ្វើលំហាត់នៅទីនេះ (Sign in here)
              </Link>
            </div>
          </div>
        )}

        {/* Teacher portal small link at bottom */}
        <div style={{ textAlign: 'center' }}>
          <Link
            href="/admin"
            style={{
              fontSize: '0.82rem',
              color: 'var(--theme-muted)',
              textDecoration: 'none',
            }}
          >
            🔒 សម្រាប់គ្រូបង្រៀន (Teacher Portal)
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function StudentRegisterPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--theme-navy)',
            fontWeight: 700,
          }}
        >
          កំពុងដំណើរការ…
        </div>
      }
    >
      <StudentRegisterForm />
    </Suspense>
  );
}
