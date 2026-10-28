'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { getDb } from '@/lib/firebaseClient';
import { useAdmin } from '@/lib/useAdmin';
import { adminPost } from '@/lib/authFetch';
import MathText from '@/components/MathText';
import { toText } from '@/lib/textValue';
import { normalize } from '@/lib/grade';
import type { Exercise, Submission, Profile } from '@/lib/types';

type Sub = { id: string } & Submission;

function fmtDuration(ms: number) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

function csvCell(v: unknown) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function Results() {
  const { id } = useParams<{ id: string }>();
  const { isAdmin, loading, user } = useAdmin();
  const [ex, setEx] = useState<Exercise | null>(null);
  const [subs, setSubs] = useState<Sub[] | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busyMsg, setBusyMsg] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'submitted' | 'inprogress'>('all');

  async function load() {
    try {
      const [exSnap, sSnap, pSnap] = await Promise.all([
        getDoc(doc(getDb(), 'exercises', id)),
        getDocs(query(collection(getDb(), 'submissions'), where('exerciseId', '==', id))),
        getDocs(collection(getDb(), 'profiles')).catch(() => null),
      ]);

      if (exSnap.exists()) setEx(exSnap.data() as Exercise);
      const list = sSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Submission) }));
      list.sort((a, b) => (b.submittedAt ?? b.startedAt) - (a.submittedAt ?? a.startedAt));
      setSubs(list);

      if (pSnap) {
        const pList = pSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((p: Profile) => !p.hidden);
        setProfiles(pList);
      }
    } catch (e: any) {
      setError(e?.message || 'Could not load results.');
    }
  }

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, id]);

  if (loading) return <div className="wrap muted">Loading…</div>;
  if (!user || !isAdmin)
    return (
      <div className="wrap">
        <Link href="/admin">Please sign in as the teacher</Link>
      </div>
    );

  function exportCsv() {
    if (!ex || !subs) return;
    const qs = ex.questions;
    const header = [
      'Name',
      'Status',
      'Score',
      'Total',
      'Started',
      'Submitted',
      'Duration',
      'Late',
      ...qs.flatMap((_, i) => [`Q${i + 1} answer`, `Q${i + 1} correct`]),
    ];
    const lines = [header.map(csvCell).join(',')];
    for (const s of subs) {
      const byId = new Map((s.details ?? []).map((d) => [d.id, d]));
      lines.push(
        [
          s.studentName,
          s.status,
          s.score ?? '',
          s.total ?? '',
          new Date(s.startedAt).toISOString(),
          s.submittedAt ? new Date(s.submittedAt).toISOString() : '',
          s.submittedAt ? fmtDuration(s.submittedAt - s.startedAt) : '',
          s.late ? 'yes' : '',
          ...qs.flatMap((q) => {
            const d = byId.get(q.id);
            return [d?.given ?? '', d ? (d.correct ? 'yes' : 'no') : ''];
          }),
        ]
          .map(csvCell)
          .join(','),
      );
    }
    // BOM so Excel opens Khmer names correctly
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(ex.title || 'results').replace(/[^\p{L}\p{N}]+/gu, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function regrade() {
    if (!confirm('Re-grade all submissions using the current answer key? Scores may change.')) return;
    setBusyMsg('Re-grading…');
    try {
      const r = await adminPost<{ updated: number; changed: number }>('/api/admin/regrade', { exerciseId: id });
      setBusyMsg(`Re-graded ${r.updated} submissions; ${r.changed} score(s) changed.`);
      await load();
    } catch (e: any) {
      setBusyMsg(e.message || 'Re-grade failed.');
    }
  }

  const submitted = subs?.filter((s) => s.status === 'submitted') ?? [];
  const inProgress = subs?.filter((s) => s.status !== 'submitted') ?? [];

  const avg = submitted.length
    ? submitted.reduce((t, s) => t + ((s.score ?? 0) / Math.max(1, s.total ?? 1)) * 100, 0) / submitted.length
    : 0;

  const maxScore = submitted.length
    ? Math.max(...submitted.map((s) => s.score ?? 0))
    : 0;

  const totalPossible = submitted[0]?.total ?? ex?.questions?.reduce((t, q) => t + (q.points || 1), 0) ?? 0;

  const onTimeCount = submitted.filter((s) => !s.late).length;
  const onTimePct = submitted.length ? (onTimeCount / submitted.length) * 100 : 0;

  const filteredSubs = subs?.filter((s) => {
    if (filter === 'submitted' && s.status !== 'submitted') return false;
    if (filter === 'inprogress' && s.status === 'submitted') return false;
    if (search.trim()) {
      return (s.studentName || '').toLowerCase().includes(search.trim().toLowerCase());
    }
    return true;
  });

  return (
    <div className="wrap stack">
      {/* Top Header & Breadcrumbs */}
      <div className="row spread" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 16 }}>
        <div className="row" style={{ gap: 12, alignItems: 'center' }}>
          <img src="/logo.png" alt="Math Logo" style={{ height: 28, width: 'auto', objectFit: 'contain' }} />
          <Link href="/admin" className="btn small secondary">← All exercises</Link>
          <Link href={`/admin/exercises/${id}`} className="btn small secondary">✏️ Edit Exercise</Link>
        </div>
        <div className="row">
          <button className="btn secondary small" onClick={load}>🔄 Refresh</button>
          <button className="btn secondary small" onClick={regrade} disabled={!submitted.length}>⚡ Re-grade</button>
          <button className="btn small" onClick={exportCsv} disabled={!subs?.length}>📥 Export CSV</button>
        </div>
      </div>

      {/* Exercise Information Banner */}
      <div className="card">
        <div className="row spread" style={{ alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem' }}>{ex?.title ?? 'Results Dashboard'}</h1>
            {ex?.description && (
              <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.92rem' }}>
                {ex.description}
              </p>
            )}
            <div className="row muted" style={{ marginTop: 8, fontSize: '0.85rem', gap: 14 }}>
              <span>📝 {ex?.questions?.length ?? 0} questions</span>
              <span>⏱️ {ex?.timeLimitMinutes ? `${ex.timeLimitMinutes} min limit` : 'No time limit'}</span>
              {ex?.deadline && <span>📅 Due {new Date(ex.deadline).toLocaleString()}</span>}
            </div>
          </div>
          <span className={`badge ${ex?.published ? 'live' : 'warn'}`}>
            {ex?.published ? '● Live' : 'Draft'}
          </span>
        </div>
        {busyMsg && (
          <div
            style={{
              marginTop: 12,
              padding: '8px 12px',
              background: 'var(--warn-bg)',
              color: '#8a5b00',
              borderRadius: 8,
              fontSize: '0.88rem',
            }}
          >
            {busyMsg}
          </div>
        )}
      </div>

      {/* Dashboard Analytics / Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="muted" style={{ fontSize: '0.82rem', fontWeight: 600, textTransform: 'uppercase' }}>Submissions</span>
          <span style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--brand)' }}>{submitted.length}</span>
          <span className="muted" style={{ fontSize: '0.8rem' }}>{subs?.length ?? 0} total attempts</span>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="muted" style={{ fontSize: '0.82rem', fontWeight: 600, textTransform: 'uppercase' }}>In Progress / Left</span>
          <span style={{ fontSize: '1.8rem', fontWeight: 700, color: '#b57900' }}>{inProgress.length}</span>
          <span className="muted" style={{ fontSize: '0.8rem' }}>Started but unsubmitted</span>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="muted" style={{ fontSize: '0.82rem', fontWeight: 600, textTransform: 'uppercase' }}>Average Score</span>
          <span style={{ fontSize: '1.8rem', fontWeight: 700, color: submitted.length > 0 ? (avg >= 70 ? 'var(--good)' : avg >= 50 ? '#b57900' : 'var(--bad)') : 'var(--muted)' }}>
            {submitted.length > 0 ? `${avg.toFixed(0)}%` : '—'}
          </span>
          <span className="muted" style={{ fontSize: '0.8rem' }}>Class performance</span>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="muted" style={{ fontSize: '0.82rem', fontWeight: 600, textTransform: 'uppercase' }}>Highest Score</span>
          <span style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--good)' }}>
            {submitted.length > 0 ? `${maxScore} / ${totalPossible}` : '—'}
          </span>
          <span className="muted" style={{ fontSize: '0.8rem' }}>Top achievement</span>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="muted" style={{ fontSize: '0.82rem', fontWeight: 600, textTransform: 'uppercase' }}>On-Time Rate</span>
          <span style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--ink)' }}>
            {submitted.length > 0 ? `${onTimePct.toFixed(0)}%` : '—'}
          </span>
          <span className="muted" style={{ fontSize: '0.8rem' }}>{onTimeCount} on-time submissions</span>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {subs === null && !error && <div className="muted">Loading student results…</div>}
      {subs?.length === 0 && <div className="card muted" style={{ textAlign: 'center', padding: 32 }}>No student submissions yet. Share the student exercise link to start collecting answers.</div>}

      {/* Submissions Filter & Search Toolbar */}
      {!!subs?.length && (
        <div className="card row spread" style={{ padding: '12px 16px', gap: 12 }}>
          <div className="grow" style={{ minWidth: 200 }}>
            <input
              placeholder="🔍 Search student by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ padding: '7px 12px' }}
            />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button
              className={`btn small ${filter === 'all' ? '' : 'secondary'}`}
              onClick={() => setFilter('all')}
            >
              All ({subs.length})
            </button>
            <button
              className={`btn small ${filter === 'submitted' ? '' : 'secondary'}`}
              onClick={() => setFilter('submitted')}
            >
              Submitted ({submitted.length})
            </button>
            <button
              className={`btn small ${filter === 'inprogress' ? '' : 'secondary'}`}
              onClick={() => setFilter('inprogress')}
            >
              In Progress ({inProgress.length})
            </button>
          </div>
        </div>
      )}

      {/* Submissions Table */}
      {!!subs?.length && (
        <div style={{ overflowX: 'auto', background: 'var(--card)', borderRadius: 12, border: '1px solid var(--line)' }}>
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Score</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Time taken</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredSubs?.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 24 }} className="muted">
                    No student submissions match your search or filter.
                  </td>
                </tr>
              )}
              {filteredSubs?.map((s) => {
                const scorePct = s.total ? ((s.score ?? 0) / s.total) * 100 : 0;
                return (
                  <Fragment key={s.id}>
                    <tr>
                      <td style={{ fontWeight: 600 }}>{s.studentName}</td>
                      <td>
                        {s.status === 'submitted' ? (
                          <div className="row" style={{ gap: 6 }}>
                            <span style={{ fontWeight: 700 }}>{s.score} / {s.total}</span>
                            <span
                              className="badge"
                              style={{
                                background: scorePct >= 80 ? 'var(--good-bg)' : scorePct >= 50 ? 'var(--warn-bg)' : 'var(--bad-bg)',
                                color: scorePct >= 80 ? 'var(--good)' : scorePct >= 50 ? '#9a6700' : 'var(--bad)',
                              }}
                            >
                              {scorePct.toFixed(0)}%
                            </span>
                          </div>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        {s.status === 'submitted' ? (
                          <span className={`badge ${s.late ? 'warn' : 'live'}`}>
                            {s.late ? 'Late' : 'Submitted'}
                          </span>
                        ) : (
                          <span className="badge">Started</span>
                        )}
                      </td>
                      <td>{s.submittedAt ? new Date(s.submittedAt).toLocaleString() : '—'}</td>
                      <td>{s.submittedAt ? fmtDuration(s.submittedAt - s.startedAt) : '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        {s.status === 'submitted' && (
                          <button
                            className="btn secondary small"
                            onClick={() => setOpen(open === s.id ? null : s.id)}
                          >
                            {open === s.id ? 'Hide' : 'View Answers'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {open === s.id && (
                      <tr>
                        <td colSpan={6} style={{ background: 'var(--bg)', padding: '16px 20px' }}>
                          <h4 style={{ margin: '0 0 12px', fontSize: '0.95rem' }}>
                            Answers Breakdown for {s.studentName}
                          </h4>
                          <div className="stack" style={{ gap: 8 }}>
                            {ex?.questions.map((q, i) => {
                              const d = s.details?.find((x) => x.id === q.id);
                              return (
                                <div
                                  key={q.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    justifyContent: 'space-between',
                                    padding: '8px 12px',
                                    background: 'var(--card)',
                                    borderRadius: 8,
                                    border: '1px solid var(--line)',
                                    gap: 12,
                                  }}
                                >
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                                      <strong style={{ minWidth: 32 }}>Q{i + 1}:</strong>
                                      <div style={{ flex: 1 }}>
                                        <MathText text={q.prompt} />
                                      </div>
                                    </div>
                                    <div style={{ marginTop: 6, marginLeft: 40, fontSize: '0.9rem' }}>
                                      <span className="muted">Student Answer: </span>
                                      {d?.given ? (
                                        <strong><MathText text={d.given} /></strong>
                                      ) : (
                                        <em className="muted">(blank)</em>
                                      )}
                                    </div>
                                  </div>
                                  <div style={{ textAlign: 'right', minWidth: 140 }}>
                                    <span className={d?.correct ? 'badge live' : 'badge warn'}>
                                      {d?.correct
                                        ? '✓ Correct'
                                        : `✕ Wrong (Answer: ${d?.correctAnswer != null ? toText(d.correctAnswer) : toText(q.answer).split('|')[0]})`}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Not Submitted Yet Section */}
      {profiles.length > 0 && (() => {
        const submittedProfileIds = new Set(
          subs?.filter((s) => s.status === 'submitted').map((s) => s.profileId).filter(Boolean)
        );
        const submittedNameKeys = new Set(
          subs?.filter((s) => s.status === 'submitted').map((s) => s.nameKey || normalize(s.studentName))
        );

        const unsubmittedProfiles = profiles.filter((p) => {
          if (submittedProfileIds.has(p.id)) return false;
          const pNameKey = p.profileKey ? p.profileKey.split('|')[0] : normalize(p.name);
          if (submittedNameKeys.has(pNameKey)) return false;
          return true;
        });

        const origin = typeof window !== 'undefined' ? window.location.origin : '';

        return (
          <div className="card" style={{ marginTop: 28, padding: '20px 24px', borderRadius: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                  Not Submitted Yet ({unsubmittedProfiles.length})
                </h3>
                <span className="muted" style={{ fontSize: '0.84rem' }}>
                  Students from automatic profiles who have not yet submitted this exercise
                </span>
              </div>

              {unsubmittedProfiles.length > 0 && (
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => {
                    const allMsgs = unsubmittedProfiles.map((p) => {
                      const parentLink = `${origin}/p/${p.parentToken}`;
                      return `សួស្តី! សូមរំលឹកថា ${p.name} មិនទាន់បានធ្វើលំហាត់ "${ex?.title || ''}" នៅឡើយទេ។ សូមចុចតំណនេះដើម្បីពិនិត្យ៖ ${parentLink}`;
                    }).join('\n\n');
                    navigator.clipboard.writeText(allMsgs);
                    alert(`Copied reminders for all ${unsubmittedProfiles.length} unsubmitted students!`);
                  }}
                  style={{ borderRadius: 10 }}
                >
                  Copy All Reminders
                </button>
              )}
            </div>

            {unsubmittedProfiles.length === 0 ? (
              <div style={{ padding: '16px 0', color: 'var(--good)', fontWeight: 600, fontSize: '0.92rem' }}>
                ✓ All student profiles have submitted this exercise! 🎉
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
                {unsubmittedProfiles.map((p) => {
                  const parentLink = `${origin}/p/${p.parentToken}`;
                  const reminderText = `សួស្តី! សូមរំលឹកថា ${p.name} មិនទាន់បានធ្វើលំហាត់ "${ex?.title || ''}" នៅឡើយទេ។ សូមចុចតំណនេះដើម្បីពិនិត្យ៖ ${parentLink}`;

                  return (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        backgroundColor: 'var(--bg)',
                        borderRadius: 10,
                        border: '1px solid var(--line)',
                        gap: 12,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: '0.95rem' }}>{p.name}</strong>
                        {p.className && <span className="muted" style={{ marginLeft: 8, fontSize: '0.82rem' }}>({p.className})</span>}
                      </div>

                      <button
                        type="button"
                        className="btn small"
                        onClick={() => {
                          navigator.clipboard.writeText(reminderText);
                          alert(`Copied reminder for ${p.name}`);
                        }}
                        style={{
                          borderRadius: 8,
                          padding: '5px 11px',
                          fontSize: '0.8rem',
                          backgroundColor: 'var(--theme-primary, #2563eb)',
                          borderColor: 'var(--theme-primary, #2563eb)',
                        }}
                      >
                        Copy Reminder (Khmer)
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
