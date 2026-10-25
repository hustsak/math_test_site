'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query } from 'firebase/firestore';
import { getAuthClient, getDb } from '@/lib/firebaseClient';
import { useAdmin } from '@/lib/useAdmin';
import type { Exercise } from '@/lib/types';

type Row = { id: string } & Exercise;

export default function AdminHome() {
  const { user, isAdmin, loading } = useAdmin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [copied, setCopied] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all');

  async function load() {
    try {
      const snap = await getDocs(query(collection(getDb(), 'exercises'), orderBy('updatedAt', 'desc')));
      setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Exercise) })));
    } catch (e: any) {
      setError(e?.message || 'Could not load exercises.');
    }
  }

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await signInWithEmailAndPassword(getAuthClient(), email.trim(), password);
    } catch {
      setError('Wrong email or password.');
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this exercise? Student submissions are kept in the database.')) return;
    await deleteDoc(doc(getDb(), 'exercises', id));
    load();
  }

  async function duplicate(r: Row) {
    const { id: _id, ...rest } = r;
    const now = Date.now();
    await addDoc(collection(getDb(), 'exercises'), {
      ...rest,
      title: `${r.title || 'Untitled'} (copy)`,
      published: false,
      createdAt: now,
      updatedAt: now,
    });
    load();
  }

  async function copyLink(id: string) {
    const url = `${window.location.origin}/e/${id}`;
    await navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(''), 1500);
  }

  if (loading) return <div className="wrap muted">Loading…</div>;

  if (!user) {
    return (
      <div className="wrap" style={{ maxWidth: 420 }}>
        <form className="card stack" onSubmit={login}>
          <h1>Teacher login</h1>
          <div>
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <div className="error">{error}</div>}
          <button className="btn" type="submit">Sign in</button>
        </form>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="wrap" style={{ maxWidth: 480 }}>
        <div className="card stack">
          <h1>Not authorized</h1>
          <p className="muted">
            {user.email} is not the admin account. Check NEXT_PUBLIC_ADMIN_EMAIL in your environment settings.
          </p>
          <button className="btn secondary" onClick={() => signOut(getAuthClient())}>Sign out</button>
        </div>
      </div>
    );
  }

  const totalExercises = rows?.length ?? 0;
  const publishedCount = rows?.filter((r) => r.published).length ?? 0;
  const draftCount = totalExercises - publishedCount;
  const totalQuestions = rows?.reduce((acc, r) => acc + (r.questions?.length || 0), 0) ?? 0;

  const filteredRows = rows?.filter((r) => {
    if (filter === 'published' && !r.published) return false;
    if (filter === 'draft' && r.published) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchTitle = (r.title || '').toLowerCase().includes(q);
      const matchDesc = (r.description || '').toLowerCase().includes(q);
      return matchTitle || matchDesc;
    }
    return true;
  });

  return (
    <div className="wrap stack">
      {/* Top Header */}
      <div className="row spread" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>📊 Teacher Dashboard</h1>
          <div className="muted" style={{ marginTop: 2 }}>
            Signed in as <strong>{user.email}</strong>
          </div>
        </div>
        <div className="row">
          <Link className="btn" href="/admin/exercises/new">+ Create New Exercise</Link>
          <button className="btn secondary" onClick={() => signOut(getAuthClient())}>Sign out</button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {/* Analytics / Stats Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="muted" style={{ fontSize: '0.82rem', fontWeight: 600, textTransform: 'uppercase' }}>Total Exercises</span>
          <span style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--brand)' }}>{totalExercises}</span>
          <span className="muted" style={{ fontSize: '0.8rem' }}>{totalQuestions} total questions</span>
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="muted" style={{ fontSize: '0.82rem', fontWeight: 600, textTransform: 'uppercase' }}>Published (Live)</span>
          <span style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--good)' }}>{publishedCount}</span>
          <span className="muted" style={{ fontSize: '0.8rem' }}>Accessible to students</span>
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="muted" style={{ fontSize: '0.82rem', fontWeight: 600, textTransform: 'uppercase' }}>Drafts</span>
          <span style={{ fontSize: '1.8rem', fontWeight: 700, color: '#b57900' }}>{draftCount}</span>
          <span className="muted" style={{ fontSize: '0.8rem' }}>Unpublished</span>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="card row spread" style={{ padding: '12px 16px', gap: 12 }}>
        <div className="grow" style={{ minWidth: 220 }}>
          <input
            placeholder="🔍 Search exercises by title or description..."
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
            All ({totalExercises})
          </button>
          <button
            className={`btn small ${filter === 'published' ? '' : 'secondary'}`}
            onClick={() => setFilter('published')}
          >
            Published ({publishedCount})
          </button>
          <button
            className={`btn small ${filter === 'draft' ? '' : 'secondary'}`}
            onClick={() => setFilter('draft')}
          >
            Drafts ({draftCount})
          </button>
        </div>
      </div>

      {rows === null && !error && <div className="muted">Loading exercises…</div>}
      {rows && filteredRows?.length === 0 && (
        <div className="card muted" style={{ textAlign: 'center', padding: '36px 16px' }}>
          {search ? 'No exercises match your search query.' : 'No exercises yet. Click "+ Create New Exercise" to get started.'}
        </div>
      )}

      {/* Exercises List */}
      <div className="stack" style={{ gap: 12 }}>
        {filteredRows?.map((r) => (
          <div className="card row spread" key={r.id} style={{ transition: 'box-shadow 0.15s ease' }}>
            <div className="grow" style={{ paddingRight: 12 }}>
              <div className="row" style={{ gap: 10, marginBottom: 4 }}>
                <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{r.title || 'Untitled'}</h2>
                <span className={`badge ${r.published ? 'live' : 'warn'}`}>
                  {r.published ? '● Published' : 'Draft'}
                </span>
              </div>
              {r.description && (
                <p className="muted" style={{ margin: '0 0 8px 0', fontSize: '0.9rem', maxLines: 2 }}>
                  {r.description.slice(0, 120)}{r.description.length > 120 ? '...' : ''}
                </p>
              )}
              <div className="row muted" style={{ fontSize: '0.85rem', gap: 16 }}>
                <span>📝 {r.questions?.length ?? 0} questions</span>
                <span>⏱️ {r.timeLimitMinutes ? `${r.timeLimitMinutes} min limit` : 'No time limit'}</span>
                {r.deadline && <span>📅 Due {new Date(r.deadline).toLocaleDateString()} {new Date(r.deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                <span>🕒 Updated {new Date(r.updatedAt).toLocaleDateString()}</span>
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              {r.published && (
                <button className="btn secondary small" onClick={() => copyLink(r.id)} title="Copy Student Link">
                  {copied === r.id ? '✓ Copied' : '🔗 Link'}
                </button>
              )}
              <Link className="btn secondary small" href={`/admin/exercises/${r.id}/results`} title="View Student Submissions">
                📊 Results
              </Link>
              <Link className="btn secondary small" href={`/admin/exercises/${r.id}`} title="Edit Exercise">
                ✏️ Edit
              </Link>
              <button className="btn secondary small" onClick={() => duplicate(r)} title="Duplicate Exercise">
                📋 Duplicate
              </button>
              <button className="btn danger small" onClick={() => remove(r.id)} title="Delete Exercise">
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
