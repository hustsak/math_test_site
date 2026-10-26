'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import {
  Users,
  Plus,
  Printer,
  Copy,
  QrCode,
  RefreshCw,
  Search,
  Check,
  ArrowLeft,
  AlertTriangle,
  UserCheck,
  UserX,
  Trash2,
  ExternalLink,
  MessageSquare,
  X,
  FileText,
} from 'lucide-react';
import { useAdmin } from '@/lib/useAdmin';
import { adminPost } from '@/lib/authFetch';
import type { Student } from '@/lib/types';

export default function AdminStudentsPage() {
  const { user, isAdmin, loading: authLoading } = useAdmin();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Add Student Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState<'single' | 'bulk'>('single');
  const [singleName, setSingleName] = useState('');
  const [bulkNames, setBulkNames] = useState('');
  const [classNameInput, setClassNameInput] = useState('');
  const [saving, setSaving] = useState(false);

  // Single Student QR Modal
  const [qrStudent, setQrStudent] = useState<Student | null>(null);

  // Regenerate Confirm Modal
  const [regenStudent, setRegenStudent] = useState<Student | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  // Printable View Mode
  const [printMode, setPrintMode] = useState(false);

  // Message language toggle
  const [messageLang, setMessageLang] = useState<'kh' | 'en'>('kh');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  async function loadStudents() {
    setLoading(true);
    setError('');
    try {
      const data = await adminPost<{ students: Student[] }>('/api/admin/students', {});
      setStudents(data?.students || []);
    } catch (e: any) {
      // Fallback: try GET if adminPost with POST is used or vice versa
      try {
        const user = (await import('@/lib/firebaseClient')).getAuthClient().currentUser;
        if (user) {
          const token = await user.getIdToken();
          const res = await fetch('/api/admin/students', {
            headers: { Authorization: `Bearer ${token}` },
          });
          const json = await res.json();
          if (res.ok) {
            setStudents(json.students || []);
            return;
          }
        }
      } catch {}
      setError(e?.message || 'Could not load students.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin) {
      loadStudents();
    }
  }, [isAdmin]);

  async function handleAddStudent(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const names =
        addMode === 'single'
          ? [singleName.trim()]
          : bulkNames
              .split('\n')
              .map((s) => s.trim())
              .filter((s) => s.length > 0);

      if (names.length === 0) {
        throw new Error('Please enter at least one name.');
      }

      await adminPost('/api/admin/students', {
        names,
        className: classNameInput.trim(),
      });

      setSingleName('');
      setBulkNames('');
      setShowAddModal(false);
      await loadStudents();
    } catch (e: any) {
      setError(e?.message || 'Failed to add student.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerateParentToken() {
    if (!regenStudent) return;
    setRegenerating(true);
    try {
      const res = await adminPost<{ success: boolean; parentToken: string }>(
        '/api/admin/students/regenerate',
        { studentId: regenStudent.id }
      );
      if (res?.parentToken) {
        setStudents((prev) =>
          prev.map((s) => (s.id === regenStudent.id ? { ...s, parentToken: res.parentToken } : s))
        );
      }
      setRegenStudent(null);
    } catch (e: any) {
      alert(e?.message || 'Failed to regenerate token.');
    } finally {
      setRegenerating(false);
    }
  }

  async function handleToggleActive(s: Student) {
    try {
      const nextActive = !s.active;
      await adminPost('/api/admin/students/toggle-active', {
        studentId: s.id,
        active: nextActive,
      });
      setStudents((prev) =>
        prev.map((item) => (item.id === s.id ? { ...item, active: nextActive } : item))
      );
    } catch (e: any) {
      alert(e?.message || 'Failed to update student status.');
    }
  }

  async function handleDeleteStudent(s: Student) {
    if (!confirm(`Are you sure you want to delete ${s.name}?`)) return;
    try {
      await adminPost('/api/admin/students/delete', { studentId: s.id });
      setStudents((prev) => prev.filter((item) => item.id !== s.id));
    } catch (e: any) {
      alert(e?.message || 'Failed to delete student.');
    }
  }

  function copyText(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function copyParentMessage(s: Student) {
    const parentLink = `${origin}/p/${s.parentToken}`;
    const msg =
      messageLang === 'kh'
        ? `សួស្តី! នេះជាតំណរបស់អ្នកដើម្បីមើលលទ្ធផលរបស់ ${s.name}៖ ${parentLink}`
        : `Hello! Here is your link to view results for ${s.name}: ${parentLink}`;
    copyText(msg, `msg-${s.id}`);
  }

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) || (s.className && s.className.toLowerCase().includes(q))
    );
  }, [students, search]);

  if (authLoading) {
    return <div className="wrap muted" style={{ textAlign: 'center', paddingTop: 60 }}>Checking admin authentication…</div>;
  }

  if (!user || !isAdmin) {
    return (
      <div className="wrap" style={{ textAlign: 'center', paddingTop: 60 }}>
        <h2>Admin Sign In Required</h2>
        <p className="muted">Please log in to the admin dashboard to manage the student roster.</p>
        <Link href="/admin" className="btn" style={{ display: 'inline-block', marginTop: 14 }}>
          Go to Sign In
        </Link>
      </div>
    );
  }

  // ================= PRINTABLE QR SHEET VIEW =================
  if (printMode) {
    return (
      <div className="print-sheet-wrapper" style={{ padding: 24, backgroundColor: '#ffffff', minHeight: '100vh' }}>
        {/* Print controls (hidden during window.print) */}
        <div className="no-print" style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'center' }}>
          <button
            type="button"
            className="btn"
            onClick={() => window.print()}
            style={{ borderRadius: 10, padding: '10px 20px', fontWeight: 700 }}
          >
            <Printer size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            Print QR Sheet Now
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={() => setPrintMode(false)}
            style={{ borderRadius: 10 }}
          >
            Back to Student Roster
          </button>
          <span className="muted" style={{ fontSize: '0.88rem' }}>
            Tip: These cards can be cut out and glued directly into students' math notebooks.
          </span>
        </div>

        {/* Printable Grid of Cards */}
        <div
          className="print-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 16,
          }}
        >
          {students.map((s) => (
            <div
              key={s.id}
              className="student-print-card"
              style={{
                border: '2px dashed #94a3b8',
                borderRadius: 14,
                padding: '16px 14px',
                pageBreakInside: 'avoid',
                backgroundColor: '#ffffff',
                color: '#0f172a',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {/* Card Header: Student Name & Class */}
              <div style={{ borderBottom: '1.5px solid #e2e8f0', paddingBottom: 8, textAlign: 'center' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{s.name}</div>
                {s.className && (
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#475569' }}>
                    ថ្នាក់៖ {s.className}
                  </div>
                )}
              </div>

              {/* QR Codes Row: Parent QR + Student QR */}
              <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', gap: 8 }}>
                {/* Parent QR */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1e3a8a', marginBottom: 4 }}>
                    📱 មាតាបិតា (Parent)
                  </div>
                  <div style={{ padding: 4, border: '1px solid #cbd5e1', borderRadius: 8, display: 'inline-block' }}>
                    <QRCodeSVG value={`${origin}/p/${s.parentToken}`} size={105} level="M" />
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 2 }}>ស្កេនមើលលទ្ធផល</div>
                </div>

                <div style={{ width: 1, backgroundColor: '#cbd5e1', height: 110 }} />

                {/* Student QR */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#047857', marginBottom: 4 }}>
                    🎓 សិស្ស (Student)
                  </div>
                  <div style={{ padding: 4, border: '1px solid #cbd5e1', borderRadius: 8, display: 'inline-block' }}>
                    <QRCodeSVG value={`${origin}/s/${s.studentToken}`} size={105} level="M" />
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 2 }}>ស្កេនធ្វើលំហាត់</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <style jsx global>{`
          @media print {
            .no-print {
              display: none !important;
            }
            body {
              background: #ffffff !important;
              color: #000000 !important;
            }
            .print-grid {
              display: grid !important;
              grid-template-columns: repeat(2, 1fr) !important;
              gap: 12px !important;
            }
            .student-print-card {
              border: 1.5px dashed #475569 !important;
              break-inside: avoid !important;
            }
          }
        `}</style>
      </div>
    );
  }

  // ================= MAIN ROSTER VIEW =================
  return (
    <div className="wrap" style={{ maxWidth: 1040, padding: '24px 16px 80px' }}>
      {/* Navigation and Title */}
      <div style={{ marginBottom: 16 }}>
        <Link
          href="/admin"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '0.92rem',
            fontWeight: 600,
            color: 'var(--brand)',
            textDecoration: 'none',
            marginBottom: 10,
          }}
        >
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.85rem', fontWeight: 800, color: 'var(--theme-navy)' }}>
              បញ្ជីសិស្ស / Student Roster
            </h1>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.94rem' }}>
              Manage student roster, generate private parent tracking links, and print QR codes.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn secondary"
              onClick={() => setPrintMode(true)}
              style={{ borderRadius: 12, padding: '9px 16px', fontWeight: 700 }}
              disabled={students.length === 0}
            >
              <Printer size={16} style={{ marginRight: 6 }} /> Print QR Sheet
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setShowAddModal(true)}
              style={{ borderRadius: 12, padding: '9px 18px', fontWeight: 700 }}
            >
              <Plus size={18} style={{ marginRight: 6 }} /> Add Student(s)
            </button>
          </div>
        </div>
      </div>

      {/* Security Privacy Notice */}
      <div
        style={{
          backgroundColor: '#eff6ff',
          border: '1.5px solid #bfdbfe',
          color: '#1e40af',
          borderRadius: 14,
          padding: '12px 16px',
          marginBottom: 20,
          fontSize: '0.94rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <AlertTriangle size={20} color="#2563eb" style={{ flexShrink: 0 }} />
        <div>
          <strong>Privacy Notice:</strong> Anyone with a parent link can see that child&apos;s results. Share it only with the parent.
        </div>
      </div>

      {/* Filter Bar & Language Toggle */}
      <div
        className="card"
        style={{
          padding: '14px 18px',
          borderRadius: 16,
          marginBottom: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 220 }}>
          <Search size={18} color="var(--muted)" />
          <input
            type="text"
            placeholder="Search student by name or class…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: '0.94rem',
              width: '100%',
              padding: '4px 0',
            }}
          />
        </div>

        {/* Message Language Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem' }}>
          <span className="muted" style={{ fontWeight: 600 }}>Message Language:</span>
          <button
            type="button"
            className={`btn small ${messageLang === 'kh' ? '' : 'secondary'}`}
            onClick={() => setMessageLang('kh')}
            style={{ borderRadius: 8, padding: '4px 10px', fontSize: '0.82rem' }}
          >
            ភាសាខ្មែរ (Khmer)
          </button>
          <button
            type="button"
            className={`btn small ${messageLang === 'en' ? '' : 'secondary'}`}
            onClick={() => setMessageLang('en')}
            style={{ borderRadius: 8, padding: '4px 10px', fontSize: '0.82rem' }}
          >
            English
          </button>
        </div>
      </div>

      {/* Roster List / Table */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ height: 68, borderRadius: 14 }} className="skeleton" />
          ))}
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="card" style={{ padding: '40px 20px', textAlign: 'center', borderRadius: 16 }}>
          <Users size={40} style={{ color: 'var(--muted)', margin: '0 auto 10px' }} />
          <h3 style={{ margin: '0 0 6px', fontSize: '1.2rem' }}>
            {search ? 'No students found matching your search.' : 'No students added yet.'}
          </h3>
          <p className="muted" style={{ margin: '0 0 16px', fontSize: '0.92rem' }}>
            Add students one by one or paste your entire class list at once.
          </p>
          <button type="button" className="btn" onClick={() => setShowAddModal(true)}>
            + Add Students Now
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredStudents.map((s) => {
            const parentLink = `${origin}/p/${s.parentToken}`;
            const studentLink = `${origin}/s/${s.studentToken}`;

            return (
              <div
                key={s.id}
                className="card"
                style={{
                  padding: '16px 20px',
                  borderRadius: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 14,
                  opacity: s.active ? 1 : 0.6,
                  border: s.active ? '1px solid var(--line)' : '1px dashed var(--line)',
                }}
              >
                {/* Left: Name, Class, Status */}
                <div style={{ minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--theme-navy)' }}>
                      {s.name}
                    </span>
                    {!s.active && (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 999,
                          backgroundColor: 'var(--bad-bg)',
                          color: 'var(--bad)',
                        }}
                      >
                        Deactivated
                      </span>
                    )}
                  </div>
                  {s.className && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: 2, fontWeight: 500 }}>
                      ថ្នាក់៖ {s.className}
                    </div>
                  )}
                </div>

                {/* Right: Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {/* Copy Parent Link */}
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={() => copyText(parentLink, `p-${s.id}`)}
                    style={{ borderRadius: 10, fontSize: '0.84rem', fontWeight: 600 }}
                    title={parentLink}
                  >
                    {copiedId === `p-${s.id}` ? <Check size={14} color="var(--good)" /> : <Copy size={14} />}
                    <span style={{ marginLeft: 4 }}>
                      {copiedId === `p-${s.id}` ? 'Copied!' : 'Copy parent link'}
                    </span>
                  </button>

                  {/* Copy Student Link */}
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={() => copyText(studentLink, `s-${s.id}`)}
                    style={{ borderRadius: 10, fontSize: '0.84rem', fontWeight: 600 }}
                    title={studentLink}
                  >
                    {copiedId === `s-${s.id}` ? <Check size={14} color="var(--good)" /> : <Copy size={14} />}
                    <span style={{ marginLeft: 4 }}>
                      {copiedId === `s-${s.id}` ? 'Copied!' : 'Copy student link'}
                    </span>
                  </button>

                  {/* Copy Message for Parent */}
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={() => copyParentMessage(s)}
                    style={{
                      borderRadius: 10,
                      fontSize: '0.84rem',
                      fontWeight: 700,
                      backgroundColor: 'rgba(74, 103, 214, 0.08)',
                      borderColor: 'var(--brand)',
                      color: 'var(--brand)',
                    }}
                    title="Copy message formatted for Telegram or Messenger"
                  >
                    {copiedId === `msg-${s.id}` ? (
                      <Check size={14} color="var(--good)" />
                    ) : (
                      <MessageSquare size={14} />
                    )}
                    <span style={{ marginLeft: 4 }}>
                      {copiedId === `msg-${s.id}` ? 'Copied!' : 'Copy message for parent'}
                    </span>
                  </button>

                  {/* View QR Code */}
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={() => setQrStudent(s)}
                    style={{ borderRadius: 10, padding: '6px 10px' }}
                    title="Show QR Code"
                  >
                    <QrCode size={15} />
                  </button>

                  {/* Regenerate Parent Link */}
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={() => setRegenStudent(s)}
                    style={{ borderRadius: 10, padding: '6px 10px' }}
                    title="New parent link (regenerates token)"
                  >
                    <RefreshCw size={14} />
                  </button>

                  {/* Toggle Active */}
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={() => handleToggleActive(s)}
                    style={{
                      borderRadius: 10,
                      padding: '6px 10px',
                      color: s.active ? 'var(--muted)' : 'var(--good)',
                    }}
                    title={s.active ? 'Deactivate student' : 'Reactivate student'}
                  >
                    {s.active ? <UserX size={15} /> : <UserCheck size={15} />}
                  </button>

                  {/* Delete */}
                  <button
                    type="button"
                    className="btn danger small"
                    onClick={() => handleDeleteStudent(s)}
                    style={{ borderRadius: 10, padding: '6px 10px' }}
                    title="Delete student"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ================= ADD STUDENT MODAL ================= */}
      {showAddModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 16,
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: 500,
              width: '100%',
              borderRadius: 20,
              padding: '24px 22px',
              boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800 }}>Add Student(s)</h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Mode Tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button
                type="button"
                className={`btn small ${addMode === 'single' ? '' : 'secondary'}`}
                onClick={() => setAddMode('single')}
                style={{ flex: 1, borderRadius: 10 }}
              >
                Single Student
              </button>
              <button
                type="button"
                className={`btn small ${addMode === 'bulk' ? '' : 'secondary'}`}
                onClick={() => setAddMode('bulk')}
                style={{ flex: 1, borderRadius: 10 }}
              >
                Paste Many (Bulk)
              </button>
            </div>

            <form onSubmit={handleAddStudent} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {addMode === 'single' ? (
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.88rem', marginBottom: 4 }}>
                    Student Name (ឈ្មោះសិស្ស) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. សុខ វិសាល"
                    value={singleName}
                    onChange={(e) => setSingleName(e.target.value)}
                    autoFocus
                  />
                </div>
              ) : (
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.88rem', marginBottom: 4 }}>
                    Paste Names (One per line / ឈ្មោះមួយជួរមួយ) *
                  </label>
                  <textarea
                    rows={6}
                    required
                    placeholder={'សុខ វិសាល\nចាន់ ធីតា\nរ័ត្ន បញ្ញា'}
                    value={bulkNames}
                    onChange={(e) => setBulkNames(e.target.value)}
                    style={{ width: '100%', fontFamily: 'inherit' }}
                    autoFocus
                  />
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.88rem', marginBottom: 4 }}>
                  Class / Group (optional / ថ្នាក់)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Grade 9A or ថ្នាក់ទី ៩A"
                  value={classNameInput}
                  onChange={(e) => setClassNameInput(e.target.value)}
                />
              </div>

              {error && <div className="error">{error}</div>}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setShowAddModal(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button type="submit" className="btn" disabled={saving}>
                  {saving ? 'Creating…' : 'Add Student(s)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= QR CODE MODAL ================= */}
      {qrStudent && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 16,
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: 440,
              width: '100%',
              borderRadius: 20,
              padding: '24px 20px',
              textAlign: 'center',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>{qrStudent.name}</h2>
              <button
                type="button"
                onClick={() => setQrStudent(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
              >
                <X size={20} />
              </button>
            </div>

            {qrStudent.className && <div className="muted" style={{ marginBottom: 16 }}>Class: {qrStudent.className}</div>}

            <div style={{ display: 'flex', justifyContent: 'space-around', gap: 16, margin: '16px 0' }}>
              {/* Parent QR */}
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e3a8a', marginBottom: 6 }}>
                  Parent Tracking QR
                </div>
                <div style={{ padding: 6, border: '1px solid #cbd5e1', borderRadius: 12, display: 'inline-block' }}>
                  <QRCodeSVG value={`${origin}/p/${qrStudent.parentToken}`} size={130} level="M" />
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 4 }}>
                  Scan to view results
                </div>
              </div>

              {/* Student QR */}
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#047857', marginBottom: 6 }}>
                  Student Link QR
                </div>
                <div style={{ padding: 6, border: '1px solid #cbd5e1', borderRadius: 12, display: 'inline-block' }}>
                  <QRCodeSVG value={`${origin}/s/${qrStudent.studentToken}`} size={130} level="M" />
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 4 }}>
                  Scan to take tests
                </div>
              </div>
            </div>

            <button
              type="button"
              className="btn"
              onClick={() => setQrStudent(null)}
              style={{ width: '100%', marginTop: 8 }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* ================= REGENERATE TOKEN CONFIRM MODAL ================= */}
      {regenStudent && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 16,
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: 440,
              width: '100%',
              borderRadius: 20,
              padding: '24px 22px',
            }}
          >
            <h2 style={{ margin: '0 0 10px', fontSize: '1.25rem', fontWeight: 800, color: 'var(--bad)' }}>
              Generate New Parent Link?
            </h2>
            <p style={{ margin: '0 0 16px', fontSize: '0.94rem', lineHeight: 1.5 }}>
              Are you sure you want to regenerate the parent link for <strong>{regenStudent.name}</strong>?
              <br />
              <strong style={{ color: 'var(--bad)' }}>
                The previous parent link and QR code will immediately stop working.
              </strong>
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setRegenStudent(null)}
                disabled={regenerating}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={handleRegenerateParentToken}
                disabled={regenerating}
              >
                {regenerating ? 'Regenerating…' : 'Yes, generate new link'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
