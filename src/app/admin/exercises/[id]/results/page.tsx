'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { getDb } from '@/lib/firebaseClient';
import { useAdmin } from '@/lib/useAdmin';
import { adminPost } from '@/lib/authFetch';
import MathText from '@/components/MathText';
import type { Exercise, Submission } from '@/lib/types';

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
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busyMsg, setBusyMsg] = useState('');

  async function load() {
    try {
      const exSnap = await getDoc(doc(getDb(), 'exercises', id));
      if (exSnap.exists()) setEx(exSnap.data() as Exercise);
      const s = await getDocs(query(collection(getDb(), 'submissions'), where('exerciseId', '==', id)));
      const list = s.docs.map((d) => ({ id: d.id, ...(d.data() as Submission) }));
      list.sort((a, b) => (b.submittedAt ?? b.startedAt) - (a.submittedAt ?? a.startedAt));
      setSubs(list);
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
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
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
  const avg = submitted.length
    ? submitted.reduce((t, s) => t + ((s.score ?? 0) / Math.max(1, s.total ?? 1)) * 100, 0) / submitted.length
    : 0;

  // Per-question statistics (share of submitted students who got it right)
  const stats = (ex?.questions ?? []).map((q, i) => {
    const rows = submitted.map((s) => s.details?.find((d) => d.id === q.id)).filter(Boolean);
    const right = rows.filter((d) => d!.correct).length;
    return { q, i, n: rows.length, pct: rows.length ? (right / rows.length) * 100 : 0 };
  });

  return (
    <div className="wrap stack">
      <div className="row spread">
        <Link href="/admin">← All exercises</Link>
        <div className="row">
          <button className="btn secondary" onClick={load}>Refresh</button>
          <button className="btn secondary" onClick={regrade} disabled={!submitted.length}>Re-grade</button>
          <button className="btn" onClick={exportCsv} disabled={!subs?.length}>Export CSV</button>
        </div>
      </div>

      <div className="card">
        <h1>{ex?.title ?? 'Results'}</h1>
        <div className="row muted">
          <span>{submitted.length} submitted</span>
          <span>{(subs?.length ?? 0) - submitted.length} in progress / abandoned</span>
          {submitted.length > 0 && <span>Average {avg.toFixed(0)}%</span>}
        </div>
        {busyMsg && <div className="notice" style={{ marginTop: 10 }}>{busyMsg}</div>}
      </div>

      {submitted.length > 0 && stats.length > 0 && (
        <div className="card stack">
          <h2>Which questions were hardest?</h2>
          <div className="muted">Share of students who answered each question correctly. Low bars = reteach.</div>
          {stats.map(({ q, i, n, pct }) => (
            <div key={q.id} className="row">
              <strong style={{ width: 34 }}>Q{i + 1}</strong>
              <div className="grow" style={{ minWidth: 160 }}>
                <MathText text={q.prompt.length > 90 ? q.prompt.slice(0, 90) + '…' : q.prompt} />
              </div>
              <div className="bar" style={{ width: 140 }}>
                <span style={{ width: `${pct}%`, background: pct < 50 ? 'var(--bad)' : undefined }} />
              </div>
              <span style={{ width: 90, textAlign: 'right' }}>
                {pct.toFixed(0)}% <span className="muted">({n})</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {error && <div className="error">{error}</div>}
      {subs === null && !error && <div className="muted">Loading…</div>}
      {subs?.length === 0 && <div className="card muted">No submissions yet.</div>}

      {!!subs?.length && (
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Score</th>
              <th>Status</th>
              <th>Submitted</th>
              <th>Time taken</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {subs.map((s) => (
              <Fragment key={s.id}>
                <tr>
                  <td>{s.studentName}</td>
                  <td>{s.status === 'submitted' ? `${s.score} / ${s.total}` : '—'}</td>
                  <td>
                    {s.status === 'submitted' ? (
                      <span className={`badge ${s.late ? 'warn' : 'live'}`}>{s.late ? 'Late' : 'Submitted'}</span>
                    ) : (
                      <span className="badge">Started</span>
                    )}
                  </td>
                  <td>{s.submittedAt ? new Date(s.submittedAt).toLocaleString() : '—'}</td>
                  <td>{s.submittedAt ? fmtDuration(s.submittedAt - s.startedAt) : '—'}</td>
                  <td>
                    {s.status === 'submitted' && (
                      <button className="btn secondary small" onClick={() => setOpen(open === s.id ? null : s.id)}>
                        {open === s.id ? 'Hide' : 'Answers'}
                      </button>
                    )}
                  </td>
                </tr>
                {open === s.id && (
                  <tr>
                    <td colSpan={6}>
                      {ex?.questions.map((q, i) => {
                        const d = s.details?.find((x) => x.id === q.id);
                        return (
                          <div key={q.id} className="row" style={{ marginBottom: 4 }}>
                            <strong>Q{i + 1}</strong>
                            <span>{d?.given ? <MathText text={d.given} /> : <em className="muted">(blank)</em>}</span>
                            <span className={d?.correct ? 'badge live' : 'badge warn'}>
                              {d?.correct ? 'correct' : `wrong (answer: ${d?.correctAnswer ?? q.answer.split('|')[0]})`}
                            </span>
                          </div>
                        );
                      })}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
