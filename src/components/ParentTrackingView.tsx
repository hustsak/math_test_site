'use client';

import React, { useEffect, useMemo, useState } from 'react';
import MathText from '@/components/MathText';
import { getFaceRating, formatKhmerCountdown } from '@/lib/parentTracking';
import type { ParentViewData, ParentExerciseDetail } from '@/lib/types';
import {
  RotateCw,
  Smartphone,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
  XCircle,
  HelpCircle,
  AlertTriangle,
  Award,
  Sparkles,
} from 'lucide-react';

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
      // Auto expand latest exercise if there is one
      if (json.exercises?.length > 0 && !expandedExId) {
        setExpandedExId(json.exercises[0].id);
      }
      try {
        localStorage.setItem(cacheKey, JSON.stringify(json));
      } catch {}
    } catch (e: any) {
      // Try to load cached data for offline support
      let loadedFromCache = false;
      try {
        const saved = localStorage.getItem(cacheKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          setData(parsed);
          setIsOffline(true);
          loadedFromCache = true;
          if (parsed.exercises?.length > 0 && !expandedExId) {
            setExpandedExId(parsed.exercises[0].id);
          }
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
    // Initial load: try reading cache first for instant render, then fetch fresh
    try {
      const saved = localStorage.getItem(cacheKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        setData(parsed);
        setLoading(false);
        if (parsed.exercises?.length > 0) {
          setExpandedExId(parsed.exercises[0].id);
        }
      }
    } catch {}

    fetchData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Progress chart data: last up to 8 exercises (chronological order)
  const chartItems = useMemo(() => {
    if (!data?.exercises) return [];
    const completed = [...data.exercises].filter((e) => e.submitted && typeof e.percentage === 'number');
    // sort oldest to newest for chronological progress
    completed.sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0));
    return completed.slice(-8);
  }, [data]);

  if (loading && !data) {
    return (
      <div style={{ maxWidth: 540, margin: '0 auto', padding: '60px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--muted)' }}>
          កំពុងផ្ទុកទិន្នន័យ…
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={{ maxWidth: 540, margin: '0 auto', padding: '40px 16px' }}>
        <div
          className="card"
          style={{
            padding: '30px 20px',
            borderRadius: 20,
            textAlign: 'center',
            border: '2px solid var(--bad)',
            backgroundColor: 'var(--bad-bg)',
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: 8 }}>🔒</div>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--bad)', margin: '0 0 10px' }}>
            មិនអាចបើកតំណនេះបានទេ
          </h1>
          <p style={{ fontSize: '1.05rem', color: 'var(--ink)', margin: 0, lineHeight: 1.5 }}>
            តំណតាមដាននេះមិនត្រឹមត្រូវ ផុតកំណត់ ឬត្រូវបានផ្លាស់ប្តូរដោយគ្រូបង្រៀន។
            សូមទាក់ទងគ្រូបង្រៀនដើម្បីសុំតំណថ្មី។
          </p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { childName, className, completedCount, totalPublishedCount, latestResult, exercises, notDoneExercises } =
    data;

  return (
    <div
      style={{
        maxWidth: 580,
        margin: '0 auto',
        padding: '16px 16px 80px',
        fontSize: '18px', // Requirement: font size at least 18px
        lineHeight: 1.5,
        color: 'var(--theme-navy, #1b2240)',
      }}
    >
      {/* Offline Notice Banner */}
      {isOffline && (
        <div
          style={{
            backgroundColor: '#fffbeb',
            border: '1.5px solid #fde68a',
            color: '#b45309',
            padding: '10px 16px',
            borderRadius: 14,
            marginBottom: 16,
            fontSize: '0.95rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={18} />
            <span>កំពុងបង្ហាញទិន្នន័យដែលបានរក្សាទុក (គ្មានអ៊ីនធឺណិត)</span>
          </div>
          <button
            type="button"
            onClick={() => fetchData(true)}
            style={{
              background: 'none',
              border: 'none',
              color: '#b45309',
              fontWeight: 700,
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            ផ្ទុកឡើងវិញ
          </button>
        </div>
      )}

      {/* Top Bar with Refresh Button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontSize: '0.92rem',
            color: 'var(--muted)',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Sparkles size={16} color="var(--brand)" /> តាមដានលទ្ធផលសិក្សា
        </span>
        <button
          type="button"
          onClick={() => fetchData(true)}
          disabled={refreshing}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderRadius: 999,
            backgroundColor: 'var(--card)',
            border: '1px solid var(--line)',
            color: 'var(--theme-navy)',
            fontSize: '0.88rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <RotateCw size={14} className={refreshing ? 'spin' : ''} />
          <span>{refreshing ? 'កំពុងផ្ទុក…' : 'ផ្ទុកទិន្នន័យថ្មី'}</span>
        </button>
      </div>

      {/* 1. Header with Child's Name and Friendly Summary */}
      <header
        style={{
          backgroundColor: 'var(--card)',
          borderRadius: 22,
          padding: '24px 22px',
          boxShadow: 'var(--theme-shadow)',
          border: '1.5px solid var(--line)',
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <h1
            style={{
              margin: 0,
              fontSize: '1.75rem', // Very large text
              fontWeight: 800,
              color: 'var(--theme-navy)',
              letterSpacing: '-0.02em',
            }}
          >
            {childName}
          </h1>
          {className && (
            <span
              style={{
                fontSize: '0.92rem',
                fontWeight: 700,
                padding: '4px 12px',
                borderRadius: 999,
                backgroundColor: 'rgba(74, 103, 214, 0.12)',
                color: 'var(--brand)',
              }}
            >
              ថ្នាក់៖ {className}
            </span>
          )}
        </div>

        {/* Big friendly summary sentence */}
        <p
          style={{
            margin: '14px 0 0',
            fontSize: '1.18rem',
            fontWeight: 700,
            color: 'var(--theme-navy)',
            lineHeight: 1.45,
          }}
        >
          កូនរបស់អ្នកបានធ្វើលំហាត់{' '}
          <span style={{ color: 'var(--brand)', fontSize: '1.35rem', fontWeight: 800 }}>{completedCount}</span>{' '}
          ក្នុងចំណោម <span style={{ fontSize: '1.35rem', fontWeight: 800 }}>{totalPublishedCount}</span>
        </p>
      </header>

      {/* 2. Latest Result: Large Prominent Card */}
      {latestResult && (
        <section style={{ marginBottom: 22 }}>
          <div
            style={{
              fontSize: '1.05rem',
              fontWeight: 800,
              color: 'var(--theme-muted)',
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            លទ្ធផលចុងក្រោយគេបង្អស់ / Latest Result
          </div>

          {(() => {
            const evalResult = getFaceRating(latestResult.percentage);
            return (
              <div
                style={{
                  backgroundColor: evalResult.bgColor,
                  border: `2px solid ${evalResult.borderColor}`,
                  borderRadius: 22,
                  padding: '22px 20px',
                  boxShadow: '0 6px 20px rgba(0,0,0,0.06)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.95rem', color: 'var(--muted)', fontWeight: 600 }}>
                      {latestResult.submittedAt
                        ? new Date(latestResult.submittedAt).toLocaleDateString('km-KH', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })
                        : ''}
                    </div>
                    <h2 style={{ margin: '4px 0 0', fontSize: '1.35rem', fontWeight: 800, color: 'var(--theme-navy)' }}>
                      {latestResult.title}
                    </h2>
                  </div>

                  {/* Large Face Icon */}
                  <div
                    style={{
                      fontSize: '3.6rem',
                      lineHeight: 1,
                      filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.12))',
                    }}
                    aria-label={evalResult.face}
                  >
                    {evalResult.emoji}
                  </div>
                </div>

                {/* Score & Evaluation: always text + face + color */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 8,
                    paddingTop: 10,
                    borderTop: `1px solid ${evalResult.borderColor}`,
                  }}
                >
                  <div>
                    <span style={{ fontSize: '1rem', color: 'var(--muted)', fontWeight: 600, marginRight: 8 }}>
                      ពិន្ទុ៖
                    </span>
                    <strong style={{ fontSize: '1.75rem', fontWeight: 900, color: evalResult.color }}>
                      {latestResult.score} / {latestResult.total}
                    </strong>
                    <span style={{ fontSize: '1.15rem', fontWeight: 700, color: evalResult.color, marginLeft: 6 }}>
                      ({latestResult.percentage}%)
                    </span>
                  </div>

                  {/* Written evaluation badge */}
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
                    <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>({evalResult.labelEn})</span>
                  </div>
                </div>
              </div>
            );
          })()}
        </section>
      )}

      {/* 3. Progress Chart of Last up to 8 Exercises (Inline SVG) */}
      {chartItems.length >= 2 && (
        <section
          style={{
            backgroundColor: 'var(--card)',
            borderRadius: 22,
            padding: '20px 18px 16px',
            boxShadow: 'var(--theme-shadow)',
            border: '1.5px solid var(--line)',
            marginBottom: 24,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--theme-navy)' }}>
              📊 ការវិវឌ្ឍពិន្ទុ ({chartItems.length} លំហាត់ចុងក្រោយ)
            </h2>
            <span style={{ fontSize: '0.88rem', color: 'var(--muted)', fontWeight: 600 }}>ភាគរយ (%)</span>
          </div>

          {/* Responsive SVG Chart */}
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <svg
              viewBox="0 0 500 210"
              style={{ width: '100%', height: 'auto', display: 'block', minWidth: 320 }}
            >
              {/* Reference Grid lines: 0%, 50%, 100% */}
              <line x1="35" y1="25" x2="480" y2="25" stroke="var(--line)" strokeDasharray="3 3" strokeWidth="1" />
              <text x="28" y="29" fill="var(--muted)" fontSize="12" fontWeight="600" textAnchor="end">
                100%
              </text>

              <line x1="35" y1="85" x2="480" y2="85" stroke="var(--line)" strokeDasharray="3 3" strokeWidth="1" />
              <text x="28" y="89" fill="var(--muted)" fontSize="12" fontWeight="600" textAnchor="end">
                50%
              </text>

              <line x1="35" y1="145" x2="480" y2="145" stroke="var(--line)" strokeWidth="1.5" />
              <text x="28" y="149" fill="var(--muted)" fontSize="12" fontWeight="600" textAnchor="end">
                0%
              </text>

              {/* Bars for each exercise */}
              {chartItems.map((item, idx) => {
                const totalBars = chartItems.length;
                const slotWidth = (480 - 45) / totalBars;
                const barWidth = Math.min(36, slotWidth * 0.65);
                const xCenter = 45 + idx * slotWidth + slotWidth / 2;
                const x = xCenter - barWidth / 2;

                const percent = Math.max(0, Math.min(100, item.percentage ?? 0));
                const barHeight = (percent / 100) * 120;
                const y = 145 - barHeight;

                const evalRes = getFaceRating(percent);

                return (
                  <g key={item.id}>
                    {/* Bar rectangle */}
                    <rect
                      x={x}
                      y={y}
                      width={barWidth}
                      height={barHeight}
                      rx="6"
                      fill={evalRes.color}
                      opacity="0.9"
                    />

                    {/* Score label above bar */}
                    <text
                      x={xCenter}
                      y={Math.max(16, y - 6)}
                      fill={evalRes.color}
                      fontSize="13"
                      fontWeight="800"
                      textAnchor="middle"
                    >
                      {percent}%
                    </text>

                    {/* Short exercise label under bar */}
                    <text
                      x={xCenter}
                      y="166"
                      fill="var(--theme-navy)"
                      fontSize="12"
                      fontWeight="700"
                      textAnchor="middle"
                    >
                      ល{idx + 1}
                    </text>

                    {/* Date subtitle */}
                    <text
                      x={xCenter}
                      y="182"
                      fill="var(--muted)"
                      fontSize="10"
                      fontWeight="500"
                      textAnchor="middle"
                    >
                      {item.submittedAt
                        ? new Date(item.submittedAt).toLocaleDateString('en-US', {
                            month: 'numeric',
                            day: 'numeric',
                          })
                        : ''}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </section>
      )}

      {/* 4. List of All Exercises (Newest First) */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: '1.25rem', fontWeight: 800, color: 'var(--theme-navy)' }}>
          ប្រវត្តិលំហាត់ទាំងអស់ ({exercises.length})
        </h2>

        {exercises.length === 0 ? (
          <div className="card" style={{ padding: '24px 20px', textAlign: 'center', borderRadius: 16 }}>
            <p style={{ margin: 0, color: 'var(--muted)' }}>កូនរបស់អ្នកមិនទាន់បានបញ្ជូនលំហាត់ណាមួយនៅឡើយទេ។</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {exercises.map((ex) => {
              const isExpanded = expandedExId === ex.id;
              const evalRes = getFaceRating(ex.percentage ?? 0);
              const wrongQuestions = (ex.questions || []).filter((q) => !q.correct);
              const allCorrect = (ex.questions || []).length > 0 && wrongQuestions.length === 0;
              const showAll = !!showAllQuestionsMap[ex.id];
              const displayedQuestions = showAll ? ex.questions || [] : wrongQuestions;

              return (
                <div
                  key={ex.id}
                  style={{
                    backgroundColor: 'var(--card)',
                    borderRadius: 18,
                    border: '1.5px solid var(--line)',
                    boxShadow: 'var(--theme-shadow)',
                    overflow: 'hidden',
                  }}
                >
                  {/* Clickable Header Card */}
                  <button
                    type="button"
                    onClick={() => setExpandedExId(isExpanded ? null : ex.id)}
                    style={{
                      width: '100%',
                      padding: '16px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      background: isExpanded ? 'var(--theme-border-subtle, #f8fafc)' : '#ffffff',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: 'inherit',
                      color: 'inherit',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.88rem', color: 'var(--muted)', fontWeight: 500, marginBottom: 2 }}>
                        {ex.submittedAt
                          ? new Date(ex.submittedAt).toLocaleDateString('km-KH', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })
                          : ''}
                        {ex.late && <span style={{ color: 'var(--bad)', marginLeft: 6 }}>· បញ្ជូនយឺត</span>}
                      </div>
                      <h3
                        style={{
                          margin: 0,
                          fontSize: '1.18rem',
                          fontWeight: 800,
                          color: 'var(--theme-navy)',
                          lineHeight: 1.3,
                        }}
                      >
                        {ex.title}
                      </h3>
                      {typeof ex.classAveragePercent === 'number' && (
                        <div style={{ fontSize: '0.86rem', color: 'var(--muted)', marginTop: 4 }}>
                          មធ្យមភាគថ្នាក់៖ <strong>{ex.classAveragePercent}%</strong>
                        </div>
                      )}
                    </div>

                    {/* Score + Face */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: evalRes.color }}>
                          {ex.score} / {ex.total}
                        </div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: evalRes.color }}>
                          {ex.percentage}%
                        </div>
                      </div>
                      <span style={{ fontSize: '2.2rem', lineHeight: 1 }} title={evalRes.labelKh}>
                        {evalRes.emoji}
                      </span>
                      {isExpanded ? (
                        <ChevronUp size={22} color="var(--muted)" />
                      ) : (
                        <ChevronDown size={22} color="var(--muted)" />
                      )}
                    </div>
                  </button>

                  {/* Expanded Breakdown */}
                  {isExpanded && (
                    <div
                      style={{
                        padding: '16px 18px 22px',
                        borderTop: '1px solid var(--line)',
                        backgroundColor: 'var(--card)',
                      }}
                    >
                      {/* All Correct Message */}
                      {allCorrect ? (
                        <div
                          style={{
                            padding: '16px',
                            backgroundColor: '#ecfdf5',
                            border: '1.5px solid #a7f3d0',
                            borderRadius: 14,
                            textAlign: 'center',
                            color: '#065f46',
                            fontWeight: 700,
                            fontSize: '1.15rem',
                          }}
                        >
                          🎉 ឆ្លើយត្រូវទាំងអស់! (All correct!)
                        </div>
                      ) : (
                        <div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              marginBottom: 12,
                              flexWrap: 'wrap',
                              gap: 8,
                            }}
                          >
                            <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--bad)' }}>
                              សំណួរដែលឆ្លើយខុស ({wrongQuestions.length})
                            </span>
                            {(ex.questions || []).length > wrongQuestions.length && (
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
                                  color: 'var(--brand)',
                                  fontSize: '0.88rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  textDecoration: 'underline',
                                }}
                              >
                                {showAll ? 'លាក់សំណួរដែលត្រូវ' : `មើលសំណួរទាំងអស់ (${ex.questions?.length})`}
                              </button>
                            )}
                          </div>

                          {/* Questions List */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            {displayedQuestions.map((q, qIndex) => {
                              return (
                                <div
                                  key={q.id || qIndex}
                                  style={{
                                    backgroundColor: q.correct ? '#fafffc' : '#fff8f8',
                                    border: q.correct ? '1.5px solid #a7f3d0' : '1.5px solid #fecaca',
                                    borderRadius: 14,
                                    padding: '14px 16px',
                                  }}
                                >
                                  {/* Question Prompt */}
                                  <div
                                    style={{
                                      fontSize: '1.1rem',
                                      fontWeight: 700,
                                      color: 'var(--theme-navy)',
                                      marginBottom: 10,
                                      display: 'flex',
                                      alignItems: 'flex-start',
                                      gap: 8,
                                    }}
                                  >
                                    {q.correct ? (
                                      <CheckCircle2 size={20} color="#059669" style={{ flexShrink: 0, marginTop: 2 }} />
                                    ) : (
                                      <XCircle size={20} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />
                                    )}
                                    <div style={{ flex: 1 }}>
                                      <MathText text={q.prompt} />
                                    </div>
                                  </div>

                                  {/* Answers Comparison */}
                                  <div
                                    style={{
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: 6,
                                      fontSize: '0.98rem',
                                      marginBottom: q.explanation ? 10 : 0,
                                      padding: '8px 12px',
                                      backgroundColor: '#ffffff',
                                      borderRadius: 10,
                                      border: '1px solid var(--line)',
                                    }}
                                  >
                                    <div>
                                      <span style={{ color: 'var(--muted)', fontWeight: 600 }}>ចម្លើយរបស់កូន៖ </span>
                                      <strong style={{ color: q.correct ? '#059669' : '#dc2626' }}>
                                        {q.childAnswer ? (
                                          <MathText text={q.childAnswer} />
                                        ) : (
                                          <span style={{ fontStyle: 'italic', color: 'var(--muted)' }}>(មិនឆ្លើយ)</span>
                                        )}
                                      </strong>
                                    </div>

                                    {!q.correct && (
                                      <div>
                                        <span style={{ color: 'var(--muted)', fontWeight: 600 }}>ចម្លើយត្រឹមត្រូវ៖ </span>
                                        <strong style={{ color: '#059669' }}>
                                          <MathText text={q.correctAnswer} />
                                        </strong>
                                      </div>
                                    )}
                                  </div>

                                  {/* Explanation */}
                                  {q.explanation && (
                                    <div
                                      style={{
                                        backgroundColor: '#fffbeb',
                                        borderLeft: '4px solid #f59e0b',
                                        borderRadius: '0 8px 8px 0',
                                        padding: '10px 12px',
                                        fontSize: '0.94rem',
                                        color: '#78350f',
                                      }}
                                    >
                                      <strong style={{ display: 'block', marginBottom: 4 }}>💡 ការពន្យល់៖</strong>
                                      <MathText text={q.explanation} />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 5. "Not Done Yet" Section for Published Exercises */}
      {notDoneExercises.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: '1.25rem',
              fontWeight: 800,
              color: 'var(--theme-navy)',
              marginBottom: 12,
            }}
          >
            <span>⏳ លំហាត់មិនទាន់បានធ្វើ ({notDoneExercises.length})</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {notDoneExercises.map((nd) => {
              const countdown = formatKhmerCountdown(nd.deadline);

              return (
                <div
                  key={nd.id}
                  style={{
                    backgroundColor: 'var(--card)',
                    borderRadius: 18,
                    padding: '18px 20px',
                    border: '1.5px solid #fde68a',
                    boxShadow: 'var(--theme-shadow)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--theme-navy)' }}>
                      {nd.title}
                    </h3>
                    {nd.deadline && (
                      <span
                        style={{
                          fontSize: '0.88rem',
                          fontWeight: 700,
                          padding: '4px 12px',
                          borderRadius: 999,
                          backgroundColor: countdown.isClosed ? 'var(--bad-bg)' : '#fef3c7',
                          color: countdown.isClosed ? 'var(--bad)' : '#b45309',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          flexShrink: 0,
                        }}
                      >
                        <Clock size={14} />
                        {countdown.textKh}
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: '0.92rem', color: 'var(--muted)' }}>
                    <span>{nd.questionCount} សំណួរ</span>
                    {nd.timeLimitMinutes > 0 && <span> · កំណត់ពេល {nd.timeLimitMinutes} នាទី</span>}
                  </div>

                  <p style={{ margin: '4px 0 0', fontSize: '0.95rem', color: '#92400e', fontWeight: 500 }}>
                    សូមរំលឹកកូនរបស់អ្នកឱ្យចូលធ្វើលំហាត់នេះឱ្យបានទាន់ពេលវេលា។
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 6. "Add to Home Screen" Tip Box (Android + iPhone) */}
      <section
        style={{
          backgroundColor: 'var(--card)',
          borderRadius: 20,
          border: '1.5px solid var(--line)',
          padding: '16px 18px',
          boxShadow: 'var(--theme-shadow)',
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
            <Smartphone size={22} color="var(--brand)" />
            <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--theme-navy)' }}>
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
              borderTop: '1px solid var(--line)',
              fontSize: '0.98rem',
              color: 'var(--theme-navy)',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            {/* Android Chrome */}
            <div style={{ backgroundColor: 'var(--theme-page-bg)', padding: '12px 14px', borderRadius: 12 }}>
              <strong style={{ color: 'var(--brand)', display: 'block', marginBottom: 6 }}>
                📱 សម្រាប់ទូរស័ព្ទ Android (Chrome)៖
              </strong>
              <ol style={{ margin: 0, paddingLeft: 22, lineHeight: 1.6 }}>
                <li>ចុចលើសញ្ញាចុចបី <strong>(⋮)</strong> នៅជ្រុងខាងស្តាំលើនៃកម្មវិធី Chrome</li>
                <li>ជ្រើសរើស <strong>«បន្ថែមទៅអេក្រង់ដើម» (Add to Home screen)</strong> រួចចុច <strong>បន្ថែម</strong></li>
              </ol>
            </div>

            {/* iPhone Safari */}
            <div style={{ backgroundColor: 'var(--theme-page-bg)', padding: '12px 14px', borderRadius: 12 }}>
              <strong style={{ color: 'var(--brand)', display: 'block', marginBottom: 6 }}>
                🍏 សម្រាប់ទូរស័ព្ទ iPhone (Safari)៖
              </strong>
              <ol style={{ margin: 0, paddingLeft: 22, lineHeight: 1.6 }}>
                <li>ចុចលើប៊ូតុងចែករំលែក <strong>(⎋ Share)</strong> នៅខាងក្រោមអេក្រង់ Safari</li>
                <li>អូសចុះក្រោម រួចជ្រើសរើស <strong>«Add to Home Screen»</strong> (បន្ថែមទៅអេក្រង់ដើម)</li>
              </ol>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
