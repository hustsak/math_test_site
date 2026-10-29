'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { StudentViewData } from '@/lib/types';
import { useGradeCodes } from '@/lib/useGradeCodes';
import { gradeLabelBoth } from '@/lib/gradeLabels';
import { CheckCircle2, Lock, BookOpen, AlertCircle, ArrowRight } from 'lucide-react';

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
  const [selectedGrade, setSelectedGrade] = useState<number | 'all'>('all');
  const gradeCodes = useGradeCodes();

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
    <div className="wrap" style={{ maxWidth: 560, padding: '16px 14px 60px' }}>
      {/* Header: just name + grade */}
      <header
        className="card"
        style={{
          padding: '16px 18px',
          borderRadius: 16,
          background: 'linear-gradient(135deg, var(--theme-sidebar-panel) 0%, var(--brand) 100%)',
          color: '#ffffff',
          marginBottom: 14,
        }}
      >
        <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>{student.name}</h1>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {enrolledGrades.map((g) => {
            const isSelected = selectedGrade === g || (enrolledGrades.length === 1 && selectedGrade === 'all');
            return (
              <button
                key={g}
                type="button"
                onClick={() => enrolledGrades.length > 1 && setSelectedGrade(selectedGrade === g ? 'all' : g)}
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  padding: '3px 12px',
                  borderRadius: 999,
                  cursor: enrolledGrades.length > 1 ? 'pointer' : 'default',
                  backgroundColor: isSelected ? '#ffffff' : 'rgba(255,255,255,0.2)',
                  color: isSelected ? 'var(--brand)' : '#ffffff',
                  border: '1.5px solid rgba(255,255,255,0.5)',
                }}
              >
                {gradeLabelBoth(g, gradeCodes)}
              </button>
            );
          })}
        </div>
      </header>

      {student.paymentStatus === 'pending' && (
        <div
          style={{
            backgroundColor: 'rgba(234, 88, 12, 0.08)',
            border: '1px solid rgba(234, 88, 12, 0.35)',
            borderRadius: 12,
            padding: '10px 14px',
            marginBottom: 12,
            fontSize: '0.84rem',
            fontWeight: 700,
            color: '#ea580c',
          }}
        >
          ⏳ រង់ចាំអនុម័តការបង់ប្រាក់ — អាចធ្វើបានតែលំហាត់សាកល្បង
        </div>
      )}

      {exercises.length === 0 ? (
        <div className="card" style={{ padding: '28px 16px', textAlign: 'center', borderRadius: 14 }}>
          <BookOpen size={32} style={{ color: 'var(--muted)', margin: '0 auto 8px' }} />
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>មិនទាន់មានលំហាត់នៅឡើយទេ</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {exercises.map((ex) => {
            const locked = !!ex.isLockedForPayment;
            const row: React.CSSProperties = {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              padding: '10px 14px',
              borderRadius: 12,
              backgroundColor: 'var(--card)',
              border: ex.isDone ? '1.5px solid var(--good)' : '1px solid var(--line)',
              textDecoration: 'none',
              color: 'var(--theme-navy)',
              opacity: locked || (ex.isClosed && !ex.isDone) ? 0.6 : 1,
              cursor: locked ? 'not-allowed' : 'pointer',
            };
            const inner = (
              <>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ex.isSample ? '🌟 ' : ''}{ex.title}
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--muted)', marginTop: 2 }}>
                    {ex.questionCount} សំណួរ{ex.timeLimitMinutes > 0 ? ` • ${ex.timeLimitMinutes} នាទី` : ''}
                  </div>
                </div>
                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 800 }}>
                  {ex.isDone ? (
                    <span style={{ color: 'var(--good)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle2 size={15} /> {ex.score ?? 0}/{ex.total ?? 0}
                    </span>
                  ) : locked ? (
                    <Lock size={15} color="var(--muted)" />
                  ) : ex.isClosed ? (
                    <span style={{ color: 'var(--theme-warning)' }}>ផុតកំណត់</span>
                  ) : (
                    <ArrowRight size={17} color="var(--brand)" />
                  )}
                </div>
              </>
            );
            return locked ? (
              <div key={ex.id} style={row}>{inner}</div>
            ) : (
              <Link key={ex.id} href={`/e/${ex.id}?token=${token}`} style={row}>{inner}</Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
