'use client';

import React, { useEffect, useState } from 'react';
import MathText from '@/components/MathText';
import { getFaceRating, formatKhmerCountdown } from '@/lib/parentTracking';
import type { ParentViewData } from '@/lib/types';
import {
  RotateCw,
  Smartphone,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Calendar,
  Sparkles,
  BookOpen,
  Check,
  Minus,
} from 'lucide-react';

function formatKhmerDateTime(timestamp: number | null | undefined): string {
  if (!timestamp) return 'មិនទាន់មាន';
  try {
    const d = new Date(timestamp);
    const datePart = d.toLocaleDateString('km-KH', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    const timePart = d.toLocaleTimeString('km-KH', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${datePart} ម៉ោង ${timePart}`;
  } catch {
    return new Date(timestamp).toLocaleDateString();
  }
}

export default function ParentTrackingView({ token }: { token: string }) {
  const [data, setData] = useState<ParentViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [isOffline, setIsOffline] = useState(false);
  const [expandedExId, setExpandedExId] = useState<string | null>(null);
  const [showAllQuestionsMap, setShowAllQuestionsMap] = useState<Record<string, boolean>>({});
  const [showInstallGuide, setShowInstallGuide] = useState(false);

  const cacheKey = `parent_tracking_cache_${token}`;

  async function fetchData(silent = false) {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError('');

    try {
      const res = await fetch(`/api/parent/${token}`, {
        cache: 'no-store',
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Parent tracking link not found.');
      }

      setData(json);
      setIsOffline(false);
      try {
        localStorage.setItem(cacheKey, JSON.stringify(json));
      } catch {}
    } catch (e: any) {
      let loadedFromCache = false;
      try {
        const saved = localStorage.getItem(cacheKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          setData(parsed);
          setIsOffline(true);
          loadedFromCache = true;
        }
      } catch {}

      if (!loadedFromCache) {
        setError(e.message || 'Could not load data.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem(cacheKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        setData(parsed);
        setLoading(false);
      }
    } catch {}

    fetchData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (loading && !data) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '70px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>⏳</div>
        <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--theme-navy, #1b2240)' }}>
          កំពុងផ្ទុកទិន្នន័យតាមដាន…
        </div>
        <p style={{ color: 'var(--muted, #64748b)', margin: '8px 0 0', fontSize: '1rem' }}>
          សូមរង់ចាំបន្តិច ប្រព័ន្ធកំពុងរៀបចំរបាយការណ៍ជូនលោកអ្នក
        </p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '40px 16px' }}>
        <div
          style={{
            padding: '36px 24px',
            borderRadius: 24,
            textAlign: 'center',
            border: '2px solid #fca5a5',
            backgroundColor: '#fef2f2',
            boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
          }}
        >
          <div style={{ fontSize: '3.2rem', marginBottom: 10 }}>🔒</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#dc2626', margin: '0 0 10px' }}>
            រកមិនឃើញព័ត៌មានតាមដានទេ
          </h1>
          <p style={{ fontSize: '1.05rem', color: '#1f2937', margin: 0, lineHeight: 1.6 }}>
            តំណភ្ជាប់នេះមិនត្រឹមត្រូវ ផុតកំណត់ ឬត្រូវបានផ្លាស់ប្តូរដោយគ្រូបង្រៀន។
            សូមទាក់ទងគ្រូបង្រៀនដើម្បីសុំតំណថ្មី។
          </p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const {
    childName,
    className,
    completedCount,
    totalPublishedCount,
    lastActiveAt,
    activeDaysCountLast7Days = 0,
    recentActivityDays = [],
    averageScorePercent = 0,
    overallRating,
    latestResult,
    exercises = [],
    notDoneExercises = [],
  } = data;

  const overallFace = overallRating || getFaceRating(averageScorePercent);

  return (
    <div
      style={{
        maxWidth: 580,
        margin: '0 auto',
        padding: '16px 16px 90px',
        fontSize: '18px',
        lineHeight: 1.5,
        color: 'var(--theme-navy, #1b2240)',
      }}
    >
      {/* Offline Notice */}
      {isOffline && (
        <div
          style={{
            backgroundColor: '#fffbeb',
            border: '1.5px solid #fde68a',
            color: '#b45309',
            padding: '12px 16px',
            borderRadius: 16,
            marginBottom: 16,
            fontSize: '0.96rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={18} />
            <span>កំពុងបង្ហាញទិន្នន័យចាស់ (គ្មានអ៊ីនធឺណិត)</span>
          </div>
          <button
            type="button"
            onClick={() => fetchData(true)}
            style={{
              background: 'none',
              border: 'none',
              color: '#b45309',
              fontWeight: 800,
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            ផ្ទុកឡើងវិញ
          </button>
        </div>
      )}

      {/* Top Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}
      >
        <span
          style={{
            fontSize: '0.98rem',
            color: 'var(--muted, #64748b)',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Sparkles size={18} color="var(--brand, #4a67d6)" /> ក្តារតាមដានសម្រាប់អាណាព្យាបាល
        </span>
        <button
          type="button"
          onClick={() => fetchData(true)}
          disabled={refreshing}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            borderRadius: 999,
            backgroundColor: '#ffffff',
            border: '1.5px solid var(--line, #e2e8f0)',
            color: 'var(--theme-navy, #1b2240)',
            fontSize: '0.92rem',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
          }}
        >
          <RotateCw size={15} className={refreshing ? 'spin' : ''} />
          <span>{refreshing ? 'កំពុងផ្ទុក…' : 'ផ្ទុកទិន្នន័យថ្មី'}</span>
        </button>
      </div>

      {/* 1. Profile Header Card */}
      <header
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 24,
          padding: '24px 22px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.05)',
          border: '1.5px solid var(--line, #e2e8f0)',
          marginBottom: 18,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: '0.92rem', color: 'var(--muted, #64748b)', fontWeight: 600 }}>
              សិស្ស / Student
            </div>
            <h1
              style={{
                margin: '2px 0 0',
                fontSize: '1.85rem',
                fontWeight: 800,
                color: 'var(--theme-navy, #1b2240)',
                letterSpacing: '-0.02em',
              }}
            >
              {childName}
            </h1>
          </div>

          {className && (
            <span
              style={{
                fontSize: '0.98rem',
                fontWeight: 800,
                padding: '6px 14px',
                borderRadius: 999,
                backgroundColor: 'rgba(74, 103, 214, 0.12)',
                color: 'var(--brand, #4a67d6)',
              }}
            >
              ថ្នាក់៖ {className}
            </span>
          )}
        </div>

        {/* Quick Summary Pill */}
        <div
          style={{
            marginTop: 18,
            padding: '14px 16px',
            borderRadius: 16,
            backgroundColor: 'var(--theme-page-bg, #f8fafc)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '2.4rem', lineHeight: 1 }}>{overallFace.emoji}</span>
            <div>
              <div style={{ fontSize: '0.86rem', color: 'var(--muted, #64748b)', fontWeight: 600 }}>
                លទ្ធផលទូទៅ
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: overallFace.color }}>
                {overallFace.labelKh}
                {completedCount > 0 && (
                  <span style={{ fontSize: '0.95rem', fontWeight: 700, marginLeft: 6 }}>
                    ({averageScorePercent}%)
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.86rem', color: 'var(--muted, #64748b)', fontWeight: 600 }}>
              បានធ្វើរួចរាល់
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--theme-navy, #1b2240)' }}>
              <span style={{ color: 'var(--brand, #4a67d6)' }}>{completedCount}</span> / {totalPublishedCount} លំហាត់
            </div>
          </div>
        </div>
      </header>

      {/* 2. WHICH DAY STUDENT ACCESSED OR NOT (7-Day Attendance / Activity Tracker) */}
      <section
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 24,
          padding: '22px 20px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.05)',
          border: '1.5px solid var(--line, #e2e8f0)',
          marginBottom: 18,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
          <h2
            style={{
              margin: 0,
              fontSize: '1.25rem',
              fontWeight: 800,
              color: 'var(--theme-navy, #1b2240)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Calendar size={22} color="var(--brand, #4a67d6)" />
            វត្តមានចូលរៀន (៧ ថ្ងៃចុងក្រោយ)
          </h2>

          <span
            style={{
              fontSize: '0.92rem',
              fontWeight: 800,
              padding: '4px 12px',
              borderRadius: 999,
              backgroundColor: activeDaysCountLast7Days > 0 ? '#ecfdf5' : '#f1f5f9',
              color: activeDaysCountLast7Days > 0 ? '#059669' : '#64748b',
            }}
          >
            បានចូល {activeDaysCountLast7Days} ថ្ងៃ
          </span>
        </div>

        <p style={{ margin: '0 0 16px', fontSize: '0.94rem', color: 'var(--muted, #64748b)' }}>
          តាមដានថាកូនរបស់អ្នកបានចូលរៀន ឬធ្វើលំហាត់នៅថ្ងៃណាខ្លះ៖
        </p>

        {/* 7-Day Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 6,
            marginBottom: 14,
          }}
        >
          {recentActivityDays.map((d) => {
            const isToday = d.dayLabelKh === 'ថ្ងៃនេះ';
            return (
              <div
                key={d.dateStr}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '10px 4px',
                  borderRadius: 14,
                  backgroundColor: d.hasActivity
                    ? '#f0fdf4'
                    : isToday
                    ? '#f8fafc'
                    : '#fafafa',
                  border: d.hasActivity
                    ? '2px solid #86efac'
                    : isToday
                    ? '2px solid #cbd5e1'
                    : '1px solid #f1f5f9',
                  textAlign: 'center',
                  transition: 'transform 0.15s ease',
                }}
              >
                {/* Day label */}
                <span
                  style={{
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    color: isToday ? 'var(--brand, #4a67d6)' : 'var(--theme-navy, #1b2240)',
                    marginBottom: 2,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {d.dayLabelKh}
                </span>

                {/* Date snippet */}
                <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: 6 }}>
                  {d.formattedDate.split(' ')[0]}
                </span>

                {/* Status Icon */}
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    backgroundColor: d.hasActivity ? '#16a34a' : '#e2e8f0',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 4,
                  }}
                  title={d.hasActivity ? `បានចូលរៀន (${d.exerciseCount} លំហាត់)` : 'មិនបានចូល'}
                >
                  {d.hasActivity ? <Check size={18} strokeWidth={3} /> : <Minus size={16} strokeWidth={2.5} color="#94a3b8" />}
                </div>

                {/* Short text badge */}
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    color: d.hasActivity ? '#15803d' : '#94a3b8',
                  }}
                >
                  {d.hasActivity ? 'បានចូល' : 'អត់'}
                </span>
              </div>
            );
          })}
        </div>

        {/* Last Active Timestamp note */}
        <div
          style={{
            fontSize: '0.92rem',
            color: 'var(--muted, #64748b)',
            paddingTop: 10,
            borderTop: '1px dashed var(--line, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Clock size={16} color="var(--brand, #4a67d6)" />
          <span>
            សកម្មភាពចុងក្រោយបង្អស់៖{' '}
            <strong style={{ color: 'var(--theme-navy, #1b2240)' }}>
              {formatKhmerDateTime(lastActiveAt)}
            </strong>
          </span>
        </div>
      </section>

      {/* 3. Latest Result Highlight (Large, Clear, Easy) */}
      {latestResult && (
        <section style={{ marginBottom: 18 }}>
          <div
            style={{
              fontSize: '1rem',
              fontWeight: 800,
              color: 'var(--muted, #64748b)',
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            លទ្ធផលលំហាត់ចុងក្រោយគេបង្អស់
          </div>

          {(() => {
            const evalResult = getFaceRating(latestResult.percentage);
            return (
              <div
                style={{
                  backgroundColor: evalResult.bgColor,
                  border: `2px solid ${evalResult.borderColor}`,
                  borderRadius: 24,
                  padding: '22px 20px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.05)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.9rem', color: 'var(--muted, #64748b)', fontWeight: 600 }}>
                      {latestResult.submittedAt
                        ? new Date(latestResult.submittedAt).toLocaleDateString('km-KH', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })
                        : ''}
                    </div>
                    <h2
                      style={{
                        margin: '4px 0 0',
                        fontSize: '1.35rem',
                        fontWeight: 800,
                        color: 'var(--theme-navy, #1b2240)',
                        lineHeight: 1.3,
                      }}
                    >
                      {latestResult.title}
                    </h2>
                  </div>

                  {/* Face Emoji */}
                  <div
                    style={{
                      fontSize: '3.6rem',
                      lineHeight: 1,
                      filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.12))',
                    }}
                    aria-label={evalResult.face}
                  >
                    {evalResult.emoji}
                  </div>
                </div>

                {/* Score & Evaluation */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 10,
                    paddingTop: 12,
                    borderTop: `1px solid ${evalResult.borderColor}`,
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.95rem', color: 'var(--muted, #64748b)', fontWeight: 600, marginRight: 8 }}>
                      ពិន្ទុទទួលបាន៖
                    </span>
                    <strong style={{ fontSize: '1.8rem', fontWeight: 900, color: evalResult.color }}>
                      {latestResult.score} / {latestResult.total}
                    </strong>
                    <span style={{ fontSize: '1.15rem', fontWeight: 700, color: evalResult.color, marginLeft: 6 }}>
                      ({latestResult.percentage}%)
                    </span>
                  </div>

                  {/* Friendly Khmer Label */}
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 14px',
                      borderRadius: 999,
                      backgroundColor: '#ffffff',
                      border: `1.5px solid ${evalResult.borderColor}`,
                      color: evalResult.color,
                      fontWeight: 800,
                      fontSize: '1.05rem',
                    }}
                  >
                    <span>{evalResult.labelKh}</span>
                  </div>
                </div>
              </div>
            );
          })()}
        </section>
      )}

      {/* 4. Pending Exercises to Complete ("លំហាត់ត្រូវធ្វើបន្ត") */}
      {notDoneExercises.length > 0 && (
        <section style={{ marginBottom: 22 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: '1.2rem',
              fontWeight: 800,
              color: '#b45309',
              marginBottom: 10,
            }}
          >
            <Clock size={20} />
            <span>លំហាត់ដែលកូនត្រូវធ្វើបន្ត ({notDoneExercises.length})</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {notDoneExercises.map((nd) => {
              const countdown = formatKhmerCountdown(nd.deadline);

              return (
                <div
                  key={nd.id}
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: 20,
                    padding: '16px 18px',
                    border: '1.5px solid #fde68a',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: '1.15rem',
                        fontWeight: 800,
                        color: 'var(--theme-navy, #1b2240)',
                      }}
                    >
                      {nd.title}
                    </h3>

                    {nd.deadline && (
                      <span
                        style={{
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          padding: '3px 10px',
                          borderRadius: 999,
                          backgroundColor: countdown.isClosed ? '#fef2f2' : '#fef3c7',
                          color: countdown.isClosed ? '#dc2626' : '#b45309',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          flexShrink: 0,
                        }}
                      >
                        <Clock size={13} />
                        {countdown.textKh}
                      </span>
                    )}
                  </div>

                  <p style={{ margin: 0, fontSize: '0.92rem', color: '#b45309', fontWeight: 600 }}>
                    👉 សូមរំលឹកកូនឱ្យចូលធ្វើលំហាត់នេះឱ្យបានទាន់ពេលវេលា។
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 5. ALL COMPLETED RESULTS (Simple Cards for Parents) */}
      <section style={{ marginBottom: 24 }}>
        <h2
          style={{
            margin: '0 0 12px',
            fontSize: '1.25rem',
            fontWeight: 800,
            color: 'var(--theme-navy, #1b2240)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <BookOpen size={22} color="var(--brand, #4a67d6)" />
          ប្រវត្តិលទ្ធផលដែលបានធ្វើ ({exercises.length})
        </h2>

        {exercises.length === 0 ? (
          <div
            style={{
              padding: '28px 20px',
              textAlign: 'center',
              borderRadius: 20,
              backgroundColor: '#ffffff',
              border: '1.5px solid var(--line, #e2e8f0)',
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📝</div>
            <p style={{ margin: 0, color: 'var(--muted, #64748b)', fontWeight: 600 }}>
              កូនរបស់អ្នកមិនទាន់បានបញ្ជូនលំហាត់ណាមួយនៅឡើយទេ។
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {exercises.map((ex) => {
              const isExpanded = expandedExId === ex.id;
              const evalRes = getFaceRating(ex.percentage ?? 0);
              const wrongCount = (ex.questions || []).filter((q) => !q.correct).length;
              const correctCount = (ex.questions || []).filter((q) => q.correct).length;
              const totalQ = (ex.questions || []).length;
              const showAll = !!showAllQuestionsMap[ex.id];
              const wrongQuestions = (ex.questions || []).filter((q) => !q.correct);
              const displayedQuestions = showAll ? ex.questions || [] : wrongQuestions;

              return (
                <div
                  key={ex.id}
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: 20,
                    border: '1.5px solid var(--line, #e2e8f0)',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
                    overflow: 'hidden',
                  }}
                >
                  {/* Card Header */}
                  <div
                    style={{
                      padding: '16px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.86rem', color: 'var(--muted, #64748b)', fontWeight: 600, marginBottom: 2 }}>
                        {ex.submittedAt ? formatKhmerDateTime(ex.submittedAt) : ''}
                        {ex.late && <span style={{ color: '#dc2626', marginLeft: 6 }}>· បញ្ជូនយឺត</span>}
                      </div>

                      <h3
                        style={{
                          margin: 0,
                          fontSize: '1.2rem',
                          fontWeight: 800,
                          color: 'var(--theme-navy, #1b2240)',
                          lineHeight: 1.3,
                        }}
                      >
                        {ex.title}
                      </h3>

                      {/* Simple summary counts for non-technical parents */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          marginTop: 6,
                          fontSize: '0.88rem',
                          fontWeight: 700,
                        }}
                      >
                        {totalQ > 0 ? (
                          <>
                            <span style={{ color: '#16a34a' }}>✓ ត្រូវ {correctCount}</span>
                            {wrongCount > 0 ? (
                              <span style={{ color: '#dc2626' }}>✕ ខុស {wrongCount}</span>
                            ) : (
                              <span style={{ color: '#16a34a' }}>🎉 ត្រូវទាំងអស់</span>
                            )}
                          </>
                        ) : null}
                      </div>
                    </div>

                    {/* Face & Score */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '1.35rem', fontWeight: 900, color: evalRes.color }}>
                          {ex.score} / {ex.total}
                        </div>
                        <div style={{ fontSize: '0.86rem', fontWeight: 800, color: evalRes.color }}>
                          {evalRes.labelKh}
                        </div>
                      </div>
                      <span style={{ fontSize: '2.5rem', lineHeight: 1 }} title={evalRes.labelKh}>
                        {evalRes.emoji}
                      </span>
                    </div>
                  </div>

                  {/* Expand / View Details Button */}
                  {totalQ > 0 && (
                    <div
                      style={{
                        padding: '10px 18px',
                        backgroundColor: '#f8fafc',
                        borderTop: '1px solid var(--line, #e2e8f0)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedExId(isExpanded ? null : ex.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--brand, #4a67d6)',
                          fontSize: '0.92rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: 0,
                          fontFamily: 'inherit',
                        }}
                      >
                        <span>{isExpanded ? 'បិទមើលចម្លើយ' : 'មើលសំណួរនិងចម្លើយរបស់កូន'}</span>
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>

                      {isExpanded && wrongCount > 0 && totalQ > wrongCount && (
                        <button
                          type="button"
                          onClick={() =>
                            setShowAllQuestionsMap((prev) => ({
                              ...prev,
                              [ex.id]: !prev[ex.id],
                            }))
                          }
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--muted, #64748b)',
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            textDecoration: 'underline',
                            padding: 0,
                          }}
                        >
                          {showAll ? 'បង្ហាញតែសំណួរខុស' : `បង្ហាញទាំងអស់ (${totalQ})`}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Expanded Questions Breakdown */}
                  {isExpanded && totalQ > 0 && (
                    <div
                      style={{
                        padding: '16px 18px',
                        borderTop: '1px solid var(--line, #e2e8f0)',
                        backgroundColor: '#ffffff',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                      }}
                    >
                      {displayedQuestions.map((q, idx) => (
                        <div
                          key={q.id || idx}
                          style={{
                            backgroundColor: q.correct ? '#f0fdf4' : '#fef2f2',
                            border: q.correct ? '1.5px solid #bbf7d0' : '1.5px solid #fecaca',
                            borderRadius: 14,
                            padding: '12px 14px',
                          }}
                        >
                          <div
                            style={{
                              fontSize: '1.05rem',
                              fontWeight: 700,
                              color: 'var(--theme-navy, #1b2240)',
                              marginBottom: 8,
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 8,
                            }}
                          >
                            {q.correct ? (
                              <CheckCircle2 size={18} color="#16a34a" style={{ flexShrink: 0, marginTop: 3 }} />
                            ) : (
                              <XCircle size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: 3 }} />
                            )}
                            <div style={{ flex: 1 }}>
                              <MathText text={q.prompt} />
                            </div>
                          </div>

                          <div
                            style={{
                              fontSize: '0.94rem',
                              padding: '8px 10px',
                              backgroundColor: '#ffffff',
                              borderRadius: 10,
                              border: '1px solid #e2e8f0',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 4,
                            }}
                          >
                            <div>
                              <span style={{ color: 'var(--muted, #64748b)', fontWeight: 600 }}>ចម្លើយរបស់កូន៖ </span>
                              <strong style={{ color: q.correct ? '#16a34a' : '#dc2626' }}>
                                {q.childAnswer ? <MathText text={q.childAnswer} /> : '(មិនឆ្លើយ)'}
                              </strong>
                            </div>
                            {!q.correct && q.correctAnswer && (
                              <div>
                                <span style={{ color: 'var(--muted, #64748b)', fontWeight: 600 }}>ចម្លើយត្រឹមត្រូវ៖ </span>
                                <strong style={{ color: '#16a34a' }}>
                                  <MathText text={q.correctAnswer} />
                                </strong>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 6. Easy Add-to-Home-Screen Shortcut Box */}
      <section
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 20,
          border: '1.5px solid var(--line, #e2e8f0)',
          padding: '16px 18px',
          boxShadow: '0 4px 14px rgba(0,0,0,0.04)',
        }}
      >
        <button
          type="button"
          onClick={() => setShowInstallGuide(!showInstallGuide)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
            padding: 0,
            fontFamily: 'inherit',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Smartphone size={22} color="var(--brand, #4a67d6)" />
            <span style={{ fontSize: '1.02rem', fontWeight: 800, color: 'var(--theme-navy, #1b2240)' }}>
              របៀបរក្សាទុកនៅលើអេក្រង់ទូរស័ព្ទ (Add to Home screen)
            </span>
          </div>
          {showInstallGuide ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>

        {showInstallGuide && (
          <div
            style={{
              marginTop: 14,
              paddingTop: 14,
              borderTop: '1px solid var(--line, #e2e8f0)',
              fontSize: '0.96rem',
              color: 'var(--theme-navy, #1b2240)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ backgroundColor: 'var(--theme-page-bg, #f8fafc)', padding: '12px 14px', borderRadius: 12 }}>
              <strong style={{ color: 'var(--brand, #4a67d6)', display: 'block', marginBottom: 4 }}>
                📱 សម្រាប់ទូរស័ព្ទ Android (Chrome)៖
              </strong>
              <p style={{ margin: 0, lineHeight: 1.6 }}>
                ចុចសញ្ញាចុចបី <strong>(⋮)</strong> នៅជ្រុងខាងស្តាំលើនៃ Chrome រួចជ្រើសរើស <strong>«បន្ថែមទៅអេក្រង់ដើម» (Add to Home screen)</strong>។
              </p>
            </div>

            <div style={{ backgroundColor: 'var(--theme-page-bg, #f8fafc)', padding: '12px 14px', borderRadius: 12 }}>
              <strong style={{ color: 'var(--brand, #4a67d6)', display: 'block', marginBottom: 4 }}>
                🍏 សម្រាប់ទូរស័ព្ទ iPhone (Safari)៖
              </strong>
              <p style={{ margin: 0, lineHeight: 1.6 }}>
                ចុចប៊ូតុងចែករំលែក <strong>(⎋ Share)</strong> នៅខាងក្រោមអេក្រង់ Safari រួចជ្រើសរើស <strong>«Add to Home Screen»</strong> (បន្ថែមទៅអេក្រង់ដើម)។
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
