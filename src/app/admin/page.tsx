'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query } from 'firebase/firestore';
import { getAuthClient, getDb } from '@/lib/firebaseClient';
import { useAdmin } from '@/lib/useAdmin';
import { adminPost } from '@/lib/authFetch';
import type { Exercise } from '@/lib/types';

type Row = { id: string } & Exercise;

export default function AdminHome() {
  const { user, isAdmin, loading } = useAdmin();

  // Auth form states (for signed-out users)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  // Exercise list states
  const [rows, setRows] = useState<Row[] | null>(null);
  const [copied, setCopied] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [error, setError] = useState('');

  // "Register another teacher" modal state (when already signed in)
  const [showAddTeacherModal, setShowAddTeacherModal] = useState(false);
  const [newTeacherEmail, setNewTeacherEmail] = useState('');
  const [newTeacherPassword, setNewTeacherPassword] = useState('');
  const [newTeacherConfirm, setNewTeacherConfirm] = useState('');
  const [addTeacherError, setAddTeacherError] = useState('');
  const [addTeacherSuccess, setAddTeacherSuccess] = useState('');
  const [addTeacherBusy, setAddTeacherBusy] = useState(false);

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

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    setAuthBusy(true);
    try {
      await signInWithEmailAndPassword(getAuthClient(), email.trim(), password);
    } catch (err: any) {
      const code = err?.code;
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setAuthError('Incorrect email or password.');
      } else if (code === 'auth/invalid-email') {
        setAuthError('Please enter a valid email address.');
      } else {
        setAuthError(err?.message || 'Sign in failed.');
      }
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    if (password !== confirmPassword) {
      setAuthError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setAuthError('Password must be at least 6 characters long.');
      return;
    }
    setAuthBusy(true);
    try {
      await createUserWithEmailAndPassword(getAuthClient(), email.trim(), password);
    } catch (err: any) {
      const code = err?.code;
      if (code === 'auth/email-already-in-use') {
        setAuthError('An account with this email already exists. Please sign in instead.');
      } else if (code === 'auth/invalid-email') {
        setAuthError('Please enter a valid email address.');
      } else if (code === 'auth/weak-password') {
        setAuthError('Password is too weak. Please use at least 6 characters.');
      } else {
        setAuthError(err?.message || 'Registration failed.');
      }
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleRegisterAnotherTeacher(e: React.FormEvent) {
    e.preventDefault();
    setAddTeacherError('');
    setAddTeacherSuccess('');
    if (newTeacherPassword !== newTeacherConfirm) {
      setAddTeacherError('Passwords do not match.');
      return;
    }
    if (newTeacherPassword.length < 6) {
      setAddTeacherError('Password must be at least 6 characters.');
      return;
    }

    setAddTeacherBusy(true);
    try {
      const res = await adminPost<{ success: boolean; user?: { email: string }; error?: string }>(
        '/api/admin/teachers/create',
        {
          email: newTeacherEmail.trim(),
          password: newTeacherPassword,
        }
      );
      if (res.error) {
        setAddTeacherError(res.error);
      } else {
        setAddTeacherSuccess(`Account created for ${newTeacherEmail.trim()}! They can now sign in at /admin.`);
        setNewTeacherEmail('');
        setNewTeacherPassword('');
        setNewTeacherConfirm('');
      }
    } catch (err: any) {
      setAddTeacherError(err?.message || 'Failed to register teacher.');
    } finally {
      setAddTeacherBusy(false);
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

  // Sign in / Registration View for unauthenticated users
  if (!user) {
    return (
      <div className="wrap" style={{ maxWidth: 440, paddingTop: 40 }}>
        <div className="card stack" style={{ padding: 28, boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
          <div style={{ textAlign: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: '2.5rem' }}>👨‍🏫</span>
            <h1 style={{ marginTop: 8, fontSize: '1.45rem' }}>
              {authMode === 'login' ? 'Teacher Sign In' : 'Register Teacher Account'}
            </h1>
            <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
              {authMode === 'login'
                ? 'Sign in to access your exercises and student results'
                : 'Create a new teacher account to manage exercises'}
            </p>
          </div>

          {/* Switcher Tab */}
          <div
            style={{
              display: 'flex',
              background: 'var(--bg)',
              borderRadius: 8,
              padding: 4,
              gap: 4,
            }}
          >
            <button
              type="button"
              className="btn small grow"
              style={{
                background: authMode === 'login' ? 'var(--card)' : 'transparent',
                color: authMode === 'login' ? 'var(--brand)' : 'var(--muted)',
                border: authMode === 'login' ? '1px solid var(--line)' : 'none',
                boxShadow: authMode === 'login' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
              }}
              onClick={() => {
                setAuthMode('login');
                setAuthError('');
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              className="btn small grow"
              style={{
                background: authMode === 'register' ? 'var(--card)' : 'transparent',
                color: authMode === 'register' ? 'var(--brand)' : 'var(--muted)',
                border: authMode === 'register' ? '1px solid var(--line)' : 'none',
                boxShadow: authMode === 'register' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
              }}
              onClick={() => {
                setAuthMode('register');
                setAuthError('');
              }}
            >
              + Register Account
            </button>
          </div>

          {authError && (
            <div
              style={{
                background: 'var(--bad-bg)',
                color: 'var(--bad)',
                border: '1px solid #fad2cf',
                padding: '8px 12px',
                borderRadius: 8,
                fontSize: '0.88rem',
              }}
            >
              {authError}
            </div>
          )}

          {authMode === 'login' ? (
            <form className="stack" onSubmit={handleSignIn}>
              <div>
                <label>Email Address</label>
                <input
                  type="email"
                  placeholder="teacher@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label>Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <button className="btn" type="submit" disabled={authBusy} style={{ marginTop: 6 }}>
                {authBusy ? 'Signing in…' : 'Sign In'}
              </button>
              <div style={{ textAlign: 'center', marginTop: 10 }}>
                <span className="muted" style={{ fontSize: '0.85rem' }}>Need an account? </span>
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--brand)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    padding: 0,
                  }}
                  onClick={() => {
                    setAuthMode('register');
                    setAuthError('');
                  }}
                >
                  Register here
                </button>
              </div>
            </form>
          ) : (
            <form className="stack" onSubmit={handleRegister}>
              <div>
                <label>Teacher Email</label>
                <input
                  type="email"
                  placeholder="teacher@school.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label>Password (min. 6 characters)</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div>
                <label>Confirm Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              <button className="btn" type="submit" disabled={authBusy} style={{ marginTop: 6 }}>
                {authBusy ? 'Creating account…' : 'Create Teacher Account'}
              </button>
              <div style={{ textAlign: 'center', marginTop: 10 }}>
                <span className="muted" style={{ fontSize: '0.85rem' }}>Already registered? </span>
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--brand)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    padding: 0,
                  }}
                  onClick={() => {
                    setAuthMode('login');
                    setAuthError('');
                  }}
                >
                  Sign in here
                </button>
              </div>
            </form>
          )}
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
          <button
            className="btn secondary"
            onClick={() => {
              setShowAddTeacherModal(true);
              setAddTeacherError('');
              setAddTeacherSuccess('');
            }}
          >
            👥 Register Teacher
          </button>
          <button className="btn secondary" onClick={() => signOut(getAuthClient())}>Sign out</button>
        </div>
      </div>

      {/* Modal / Dialog for registering another teacher */}
      {showAddTeacherModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddTeacherModal(false);
          }}
        >
          <div
            className="card stack"
            style={{
              width: '100%',
              maxWidth: 480,
              boxShadow: '0 12px 32px rgba(0,0,0,0.15)',
              padding: 24,
            }}
          >
            <div className="row spread">
              <h2 style={{ margin: 0 }}>👥 Register Another Teacher</h2>
              <button
                type="button"
                className="btn small secondary"
                onClick={() => setShowAddTeacherModal(false)}
                style={{ border: 'none', fontSize: '1.2rem', padding: '0 6px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
            <p className="muted" style={{ margin: '0 0 10px 0', fontSize: '0.88rem' }}>
              Create a login account for a fellow teacher. They will be able to sign in, create math exercises, and see student submissions.
            </p>

            {addTeacherSuccess && (
              <div
                style={{
                  background: 'var(--good-bg)',
                  color: 'var(--good)',
                  border: '1px solid #b7eb8f',
                  padding: '8px 12px',
                  borderRadius: 8,
                  fontSize: '0.88rem',
                }}
              >
                {addTeacherSuccess}
              </div>
            )}

            {addTeacherError && (
              <div
                style={{
                  background: 'var(--bad-bg)',
                  color: 'var(--bad)',
                  border: '1px solid #fad2cf',
                  padding: '8px 12px',
                  borderRadius: 8,
                  fontSize: '0.88rem',
                }}
              >
                {addTeacherError}
              </div>
            )}

            <form className="stack" onSubmit={handleRegisterAnotherTeacher}>
              <div>
                <label>Teacher Email</label>
                <input
                  type="email"
                  placeholder="colleague@school.edu"
                  value={newTeacherEmail}
                  onChange={(e) => setNewTeacherEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label>Initial Password (min. 6 characters)</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={newTeacherPassword}
                  onChange={(e) => setNewTeacherPassword(e.target.value)}
                  required
                />
              </div>
              <div>
                <label>Confirm Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={newTeacherConfirm}
                  onChange={(e) => setNewTeacherConfirm(e.target.value)}
                  required
                />
              </div>
              <div className="row spread" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setShowAddTeacherModal(false)}
                >
                  Close
                </button>
                <button type="submit" className="btn" disabled={addTeacherBusy}>
                  {addTeacherBusy ? 'Creating account…' : 'Create Teacher Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
