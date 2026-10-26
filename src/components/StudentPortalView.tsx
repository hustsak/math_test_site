'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import MathText from '@/components/MathText';
import { formatKhmerCountdown } from '@/lib/parentTracking';
import type { StudentViewData } from '@/lib/types';
import { CheckCircle2, Clock, Lock, BookOpen, AlertCircle, ArrowRight } from 'lucide-react';

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

  useEffect(() => {
    if (!initialData) {
      let active = true;
      async function load() {
        if (!token) return;
        setLoading(true);
        setError('');
        try {
          const res = await fetch(`/api/student/${token}`, {
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
          if (active) {
            setError(e.message || 'Could not load student information.');
          }
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      }
      load();
      return () => {
        active = false;
      };
    }
  }, [token, initialData]);

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
        <div className="card error stack" style={{ padding: 24, textAlign: 'center' }}>
          <AlertCircle size={40} style={{ margin: '0 auto', color: 'var(--bad)' }} />
          <h2 style={{ margin: '8px 0 4px', fontSize: '1.35rem' }}>មិនអាចបើកតំណនេះបានទេ</h2>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.98rem' }}>
            {error || 'តំណសិស្សមិនត្រឹមត្រូវ ឬត្រូវបានបិទដំណើរការ។ សូមទាក់ទងគ្រូបង្រៀនរបស់អ្នក។'}
          </p>
        </div>
      </div>
    );
  }

  const { student, exercises } = data;

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

        {student.className && (
          <div style={{ display: 'inline-block', marginTop: 10 }}>
            <span
              style={{
                fontSize: '0.85rem',
                fontWeight: 700,
                padding: '4px 12px',
                borderRadius: 999,
                backgroundColor: 'rgba(255, 255, 255, 0.25)',
              }}
            >
              ថ្នាក់៖ {student.className}
            </span>
          </div>
        )}

        <p style={{ margin: '10px 0 0', fontSize: '0.95rem', opacity: 0.92, lineHeight: 1.4 }}>
          សូមជ្រើសរើសលំហាត់ខាងក្រោមដើម្បីចាប់ផ្ដើមធ្វើ។ ឈ្មោះរបស់អ្នកត្រូវបានបញ្ចូលដោយស្វ័យប្រវត្តិ។
        </p>
      </header>

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

                  {/* Status Badge */}
                  <div>
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
                  ) : (
                    <div style={{ fontSize: '0.88rem', color: 'var(--muted)' }}>
                      ឈ្មោះរបស់អ្នកត្រូវបានបំពេញរួចជាស្រេច
                    </div>
                  )}

                  {/* Button */}
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
                    }}
                  >
                    <span>{ex.isDone ? 'មើលលទ្ធផលឡើងវិញ' : 'ចាប់ផ្ដើមធ្វើលំហាត់'}</span>
                    <ArrowRight size={16} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
