'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import MathText from '@/components/MathText';
import { formatKhmerCountdown } from '@/lib/parentTracking';
import type { StudentViewData } from '@/lib/types';
import { CheckCircle2, Clock, Lock, BookOpen, AlertCircle, ArrowRight, Copy, Check } from 'lucide-react';

export default function StudentPortalView({
  token,
  initialData,
}: {
  token: string;
  initialData?: StudentViewData | null;
}) {
  const [data, setData] = useState<StudentViewData | null>(initialData || null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!token) return;
      try {
        const res = await fetch(`/api/student/${encodeURIComponent(token)}`, {
          cache: 'no-store',
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || 'Student link not found or inactive.');
        }
        if (active) {
          setData(json);
        }
      } catch (e: any) {
        if (active && !data) {
          setError(e.message || 'Could not load student information.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();

    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      window.removeEventListener('focus', onFocus);
    };
  }, [token]);

  if (loading) {
    return (
      <div className="wrap" style={{ maxWidth: 640, textAlign: 'center', paddingTop: 80 }}>
        <div style={{ fontSize: '1.25rem', color: 'var(--muted)', fontWeight: 600 }}>
          កំពុងផ្ទុកព័ត៌មានសិស្ស… / Loading…
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="wrap" style={{ maxWidth: 640, paddingTop: 60 }}>
        <div className="card error stack" style={{ padding: 24, textAlign: 'center', backgroundColor: 'var(--theme-card-bg)', border: '1px solid var(--theme-border)', borderRadius: 20 }}>
          <AlertCircle size={40} style={{ margin: '0 auto', color: 'var(--bad)' }} />
          <h2 style={{ margin: '8px 0 4px', fontSize: '1.35rem', color: 'var(--theme-navy)' }}>មិនអាចបើកតំណនេះបានទេ</h2>
          <p style={{ margin: 0, color: 'var(--theme-muted)', fontSize: '0.98rem' }}>
            {error || 'តំណសិស្សមិនត្រឹមត្រូវ ឬត្រូវបានបិទដំណើរការ។ សូមទាក់ទងគ្រូបង្រៀនរបស់អ្នក។'}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
            <Link
              href="/student"
              className="btn primary"
              style={{ padding: '9px 18px', borderRadius: 10, fontWeight: 800, fontSize: '0.88rem' }}
            >
              👉 ចូលតាមឈ្មោះសិស្ស (Login by Name)
            </Link>
            <Link
              href="/register"
              className="btn secondary"
              style={{ padding: '9px 18px', borderRadius: 10, fontWeight: 800, fontSize: '0.88rem' }}
            >
              ✍️ ចុះឈ្មោះថ្មី (Register)
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const [selectedGrade, setSelectedGrade] = useState<number | 'all'>('all');

  const { student, exercises: rawExercises } = data;

  const rawGrades = Array.isArray(student.grades) && student.grades.length > 0
    ? student.grades
    : (student.grade ? [student.grade] : []);
  const enrolledGrades = Array.from(new Set(rawGrades.filter(Boolean))).sort((a, b) => a - b);

  const exercises = selectedGrade === 'all'
    ? rawExercises
    : rawExercises.filter((ex) => {
        if (Array.isArray(ex.gradeLevels) && ex.gradeLevels.length > 0) {
          return ex.gradeLevels.includes(selectedGrade);
        }
        return true;
      });

  return (
    <div className="wrap" style={{ maxWidth: 680, padding: '24px 16px 80px' }}>
      {/* Student Profile Header */}
      <header
        className="card stack"
        style={{
          padding: '24px 22px',
          borderRadius: 20,
          background: 'linear-gradient(135deg, var(--theme-sidebar-panel) 0%, var(--brand) 100%)',
          color: '#ffffff',
          boxShadow: '0 8px 24px rgba(74, 103, 214, 0.25)',
          marginBottom: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.6rem',
              fontWeight: 800,
            }}
          >
            🎓
          </div>
          <div>
            <div style={{ fontSize: '0.92rem', opacity: 0.9, fontWeight: 500 }}>
              សួស្តី! / Hello!
            </div>
            <h1 style={{ margin: '2px 0 0', fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.01em' }}>
              {student.name}
            </h1>
          </div>
        </div>

        {/* Enrolled Grade Badges / Interactive Filters */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
          {enrolledGrades.length > 1 && (
            <button
              type="button"
              onClick={() => setSelectedGrade('all')}
              style={{
                fontSize: '0.82rem',
                fontWeight: 800,
                padding: '5px 12px',
                borderRadius: 999,
                cursor: 'pointer',
                backgroundColor: selectedGrade === 'all' ? '#ffffff' : 'rgba(255, 255, 255, 0.15)',
                color: selectedGrade === 'all' ? 'var(--brand)' : '#ffffff',
                border: '1.5px solid rgba(255, 255, 255, 0.5)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                transition: 'all 0.15s ease',
              }}
            >
              <span>📋</span>
              <span>ទាំងអស់ (All Grades)</span>
            </button>
          )}

          {enrolledGrades.map((g) => {
            const isSelected = selectedGrade === g || (enrolledGrades.length === 1 && selectedGrade === 'all');
            return (
              <button
                key={g}
                type="button"
                onClick={() => setSelectedGrade(selectedGrade === g && enrolledGrades.length > 1 ? 'all' : g)}
                title={`ចុចដើម្បីមើលលំហាត់ថ្នាក់ទី ${g}`}
                style={{
                  fontSize: '0.84rem',
                  fontWeight: 800,
                  padding: '5px 14px',
                  borderRadius: 999,
                  cursor: enrolledGrades.length > 1 ? 'pointer' : 'default',
                  backgroundColor: isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.2)',
                  color: isSelected ? 'var(--brand)' : '#ffffff',
                  border: isSelected ? '1.5px solid #ffffff' : '1.5px solid rgba(255, 255, 255, 0.35)',
                  boxShadow: isSelected ? '0 3px 10px rgba(0,0,0,0.18)' : 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                }}
              >
                <span>📚</span>
                <span>ថ្នាក់ទី {g} (Grade {g})</span>
                {isSelected && enrolledGrades.length > 1 && <span style={{ fontSize: '0.75rem', opacity: 0.9 }}>✓</span>}
              </button>
            );
          })}

          {student.className && (
            <span
              style={{
                fontSize: '0.84rem',
                fontWeight: 700,
                padding: '5px 12px',
                borderRadius: 999,
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                color: '#ffffff',
              }}
            >
              {student.className}
            </span>
          )}
        </div>

        {enrolledGrades.length > 1 && (
          <div style={{ fontSize: '0.8rem', opacity: 0.88, marginTop: 4 }}>
            💡 <em>ចុចលើកម្រិតថ្នាក់នីមួយៗខាងលើ ដើម្បីមើលលំហាត់តាមថ្នាក់នោះ</em>
          </div>
        )}

        <p style={{ margin: '12px 0 0', fontSize: '0.95rem', opacity: 0.92, lineHeight: 1.4 }}>
          សូមជ្រើសរើសលំហាត់ខាងក្រោមដើម្បីចាប់ផ្ដើមធ្វើ។ ឈ្មោះរបស់អ្នកត្រូវបានបញ្ចូលដោយស្វ័យប្រវត្តិ។
        </p>
      </header>

      {/* Unique Link & Payment Status Banners */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
        {/* Unique Link Banner */}
        <div
          style={{
            backgroundColor: 'var(--card)',
            border: '1.5px solid var(--theme-border)',
            borderRadius: 16,
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            boxShadow: 'var(--theme-shadow)',
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--theme-navy)' }}>
              🔗 តំណផ្ទាល់ខ្លួនរបស់អ្នក (Personal Link)
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 2 }}>
              រក្សាទុកតំណនេះដើម្បីចូលធ្វើលំហាត់ដោយផ្ទាល់
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const url = window.location.href;
              navigator.clipboard.writeText(url);
              setCopiedLink(true);
              setTimeout(() => setCopiedLink(false), 2500);
            }}
            className="btn small"
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              fontSize: '0.82rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              backgroundColor: copiedLink ? '#059669' : 'var(--theme-primary)',
              borderColor: copiedLink ? '#059669' : 'var(--theme-primary)',
              color: '#ffffff',
            }}
          >
            {copiedLink ? <Check size={14} /> : <Copy size={14} />}
            <span>{copiedLink ? 'បានចម្លង!' : 'ចម្លងតំណផ្ទាល់ខ្លួន (Copy Link)'}</span>
          </button>
        </div>

        {/* Pending Payment Notice */}
        {student.paymentStatus === 'pending' && (
          <div
            style={{
              backgroundColor: 'rgba(234, 88, 12, 0.08)',
              border: '1.5px solid rgba(234, 88, 12, 0.35)',
              borderRadius: 16,
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
            }}
          >
            <div style={{ fontSize: '1.4rem', lineHeight: 1 }}>⏳</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#ea580c' }}>
                ការទូទាត់ប្រាក់មិនទាន់ត្រូវបានអនុម័ត (Payment Pending Approval)
              </div>
              <div style={{ fontSize: '0.84rem', color: 'var(--theme-navy)', marginTop: 4, lineHeight: 1.45 }}>
                បច្ចុប្បន្នអ្នកអាចចូលធ្វើ<strong>លំហាត់សាកល្បងឥតគិតថ្លៃ (Sample Test Cases)</strong> បាន។ ពេលលោកគ្រូបានអនុម័តការបង់ប្រាក់រួច លំហាត់ទាំងអស់នឹងត្រូវបានបើកជូនភ្លាមៗ។
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Exercises Section Title */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--theme-navy)' }}>
          បញ្ជីលំហាត់ ({exercises.length})
        </h2>
      </div>

      {/* Exercises List */}
      {exercises.length === 0 ? (
        <div className="card" style={{ padding: '36px 20px', textAlign: 'center', borderRadius: 16 }}>
          <BookOpen size={40} style={{ color: 'var(--muted)', margin: '0 auto 12px' }} />
          <h3 style={{ margin: '0 0 6px', fontSize: '1.15rem' }}>មិនទាន់មានលំហាត់នៅឡើយទេ</h3>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.92rem' }}>
            គ្រូបង្រៀនមិនទាន់បានដាក់លំហាត់សម្រាប់អ្នកនៅឡើយទេ។ សូមពិនិត្យមើលឡើងវិញនៅពេលក្រោយ!
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {exercises.map((ex) => {
            const countdown = formatKhmerCountdown(ex.deadline);

            return (
              <div
                key={ex.id}
                className="card"
                style={{
                  padding: '20px 22px',
                  borderRadius: 18,
                  border: ex.isDone
                    ? '1.5px solid var(--good)'
                    : ex.isClosed
                    ? '1px solid var(--line)'
                    : '1.5px solid var(--brand)',
                  backgroundColor: 'var(--card)',
                  boxShadow: 'var(--theme-shadow)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <h3
                      style={{
                        margin: '0 0 6px',
                        fontSize: '1.2rem',
                        fontWeight: 800,
                        color: 'var(--theme-navy)',
                        lineHeight: 1.3,
                      }}
                    >
                      {ex.title}
                    </h3>
                    {ex.description && (
                      <div style={{ fontSize: '0.9rem', color: 'var(--muted)', marginBottom: 8 }}>
                        <MathText text={ex.description} />
                      </div>
                    )}
                  </div>

                  {/* Status Badges */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {ex.isSample && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: '0.78rem',
                          fontWeight: 800,
                          padding: '3px 10px',
                          borderRadius: 999,
                          backgroundColor: '#10b981',
                          color: '#ffffff',
                        }}
                      >
                        🌟 លំហាត់សាកល្បង (Sample)
                      </span>
                    )}

                    {ex.isDone ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          padding: '4px 12px',
                          borderRadius: 999,
                          backgroundColor: 'var(--good-bg)',
                          color: 'var(--good)',
                        }}
                      >
                        <CheckCircle2 size={16} /> បានធ្វើរួច
                      </span>
                    ) : ex.isLockedForPayment ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          padding: '4px 12px',
                          borderRadius: 999,
                          backgroundColor: 'rgba(234, 88, 12, 0.12)',
                          color: '#ea580c',
                          border: '1px solid rgba(234, 88, 12, 0.3)',
                        }}
                      >
                        <Lock size={15} /> រង់ចាំបង់ប្រាក់
                      </span>
                    ) : ex.isClosed ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          padding: '4px 12px',
                          borderRadius: 999,
                          backgroundColor: 'var(--warn-bg)',
                          color: 'var(--theme-warning)',
                        }}
                      >
                        <Lock size={15} /> ផុតកំណត់
                      </span>
                    ) : (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          padding: '4px 12px',
                          borderRadius: 999,
                          backgroundColor: 'rgba(74, 103, 214, 0.12)',
                          color: 'var(--brand)',
                        }}
                      >
                        កំពុងបើក
                      </span>
                    )}
                  </div>
                </div>

                {/* Meta row: Questions count, Time limit, Countdown */}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 16,
                    fontSize: '0.88rem',
                    color: 'var(--muted)',
                  }}
                >
                  <span>{ex.questionCount} សំណួរ</span>
                  <span>•</span>
                  <span>
                    {ex.timeLimitMinutes > 0 ? `កំណត់ ${ex.timeLimitMinutes} នាទី` : 'មិនកំណត់ពេល'}
                  </span>
                  {ex.deadline && (
                    <>
                      <span>•</span>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          color: countdown.isClosed ? 'var(--bad)' : 'var(--muted)',
                          fontWeight: countdown.isClosed ? 600 : 400,
                        }}
                      >
                        <Clock size={14} /> {countdown.textKh}
                      </span>
                    </>
                  )}
                </div>

                {/* Score or Action CTA */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: 10,
                    borderTop: '1px solid var(--line)',
                    marginTop: 2,
                  }}
                >
                  {ex.isDone ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: '0.92rem', color: 'var(--muted)', fontWeight: 600 }}>
                        ពិន្ទុរបស់អ្នក៖
                      </span>
                      <span
                        style={{
                          fontSize: '1.15rem',
                          fontWeight: 800,
                          color: 'var(--good)',
                        }}
                      >
                        {ex.score ?? 0} / {ex.total ?? 0}
                      </span>
                    </div>
                  ) : ex.isLockedForPayment ? (
                    <div style={{ fontSize: '0.84rem', color: '#ea580c', fontWeight: 600 }}>
                      ⚠️ ត្រូវការអនុម័តការបង់ប្រាក់ដើម្បីធ្វើលំហាត់នេះ
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.88rem', color: 'var(--muted)' }}>
                      ឈ្មោះរបស់អ្នកត្រូវបានបំពេញរួចជាស្រេច
                    </div>
                  )}

                  {/* Button */}
                  {ex.isLockedForPayment ? (
                    <span
                      style={{
                        borderRadius: 12,
                        padding: '8px 16px',
                        fontSize: '0.9rem',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        backgroundColor: 'var(--theme-page-bg)',
                        color: 'var(--muted)',
                        border: '1px solid var(--line)',
                        cursor: 'not-allowed',
                      }}
                    >
                      <Lock size={15} />
                      <span>ចាក់សោ (Locked)</span>
                    </span>
                  ) : (
                    <Link
                      href={`/e/${ex.id}?token=${token}`}
                      className={`btn ${ex.isDone ? 'secondary' : ''}`}
                      style={{
                        borderRadius: 12,
                        padding: '8px 18px',
                        fontSize: '0.95rem',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        textDecoration: 'none',
                        backgroundColor: ex.isSample && !ex.isDone ? '#10b981' : undefined,
                        borderColor: ex.isSample && !ex.isDone ? '#10b981' : undefined,
                        color: ex.isSample && !ex.isDone ? '#ffffff' : undefined,
                      }}
                    >
                      <span>
                        {ex.isDone
                          ? 'មើលលទ្ធផលឡើងវិញ'
                          : ex.isSample
                          ? 'ធ្វើលំហាត់សាកល្បង'
                          : 'ចាប់ផ្ដើមធ្វើលំហាត់'}
                      </span>
                      <ArrowRight size={16} />
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
