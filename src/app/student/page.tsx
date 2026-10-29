'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Calendar,
  Clock,
  CheckCircle2,
  Award,
  AlertCircle,
  ExternalLink,
  Sun,
  Moon,
  QrCode,
  Copy,
  ChevronRight,
  ChevronDown,
  Folder,
  LogOut,
  RefreshCw,
  Sparkles,
  UserCheck,
  Lock,
  Check,
} from 'lucide-react';

import { useGradeCodes } from '@/lib/useGradeCodes';
import { gradeLabelBoth, gradeLabelEn, gradeLabelKh } from '@/lib/gradeLabels';

interface PortalData {
  student: {
    id: string;
    name: string;
    grade: number;
    grades?: number[];
    className: string | null;
    expirationDate: string;
    parentToken: string | null;
    studentToken?: string | null;
    paymentStatus?: 'approved' | 'pending';
  };
  availableNow: Array<{
    id: string;
    title: string;
    description: string;
    chapter?: string | null;
    topic?: string | null;
    timeLimitMinutes: number;
    deadline: string | null;
    gradeLevels: number[];
    questionCount: number;
    totalPoints: number;
    isSample?: boolean;
    isLockedForPayment?: boolean;
  }>;
  upcoming: Array<{
    id: string;
    title: string;
    description: string;
    chapter?: string | null;
    topic?: string | null;
    scheduledPublishAt: string | number | null;
    timeLimitMinutes: number;
    deadline: string | null;
    gradeLevels: number[];
    questionCount: number;
    totalPoints: number;
    isSample?: boolean;
    isLockedForPayment?: boolean;
  }>;
  completed: Array<{
    exerciseId: string;
    submissionId: string;
    title: string;
    description: string;
    score: number;
    total: number;
    percentage: number;
    submittedAt: number;
    late: boolean;
    questionCount: number;
  }>;
  closed: Array<{
    id: string;
    title: string;
    description: string;
    deadline: string | null;
    questionCount: number;
    totalPoints: number;
  }>;
}

export default function StudentPortalPage({ targetGrade }: { targetGrade?: number }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [studentName, setStudentName] = useState('');
  const [className, setClassName] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<PortalData | null>(null);
  const [toast, setToast] = useState('');
  const gradeCodes = useGradeCodes();
  // "ថ្នាក់ទី 7" / "Grade 7", or the class name (e.g. វិញ្ញាសាពេទ្យ) for a named class
  const targetNameKh = targetGrade ? gradeLabelKh(targetGrade, gradeCodes) : '';
  const targetNameEn = targetGrade ? gradeLabelEn(targetGrade, gradeCodes) : '';

  // Parent QR Modal
  const [showParentModal, setShowParentModal] = useState(false);

  // Chapter collapse state
  const [collapsedChapters, setCollapsedChapters] = useState<Record<string, boolean>>({});

  const toggleChapter = (chapterKey: string) => {
    setCollapsedChapters((prev) => ({
      ...prev,
      [chapterKey]: !prev[chapterKey],
    }));
  };

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  // Synchronize theme
  useEffect(() => {
    const saved = localStorage.getItem('mathtest_theme') as 'light' | 'dark' | null;
    if (saved) {
      setTheme(saved);
      document.documentElement.setAttribute('data-theme', saved);
    }
  }, []);

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('mathtest_theme', next);
    document.documentElement.setAttribute('data-theme', next);
  }

  // Check saved name in localStorage on mount
  useEffect(() => {
    const storagePrefix = targetGrade ? `math_portal_g${targetGrade}_` : 'math_portal_';
    const savedName = localStorage.getItem(`${storagePrefix}student_name`) || localStorage.getItem('math_portal_student_name');
    const savedClass = localStorage.getItem(`${storagePrefix}student_class`) || localStorage.getItem('math_portal_student_class') || '';
    if (savedName) {
      setStudentName(savedName);
      setClassName(savedClass);
      loadPortalData(savedName, savedClass);
    }
  }, [targetGrade]);

  // Real-time automatic synchronization (polls every 10 seconds + on window focus/visibility)
  useEffect(() => {
    if (!isLoggedIn || !studentName.trim()) return;

    const interval = setInterval(() => {
      // Silently refresh data without flickering the main loader
      loadPortalData(studentName, className, undefined, true);
    }, 10000);

    const handleFocus = () => {
      loadPortalData(studentName, className, undefined, true);
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        loadPortalData(studentName, className, undefined, true);
      }
    });

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isLoggedIn, studentName, className, targetGrade]);

  async function loadPortalData(
    nameToFetch: string,
    classToFetch?: string,
    requestedGradeOverride?: number,
    silent: boolean = false
  ) {
    if (!nameToFetch.trim()) return;
    if (!silent) setLoading(true);
    setError('');
    try {
      const activeRequestedGrade = requestedGradeOverride !== undefined ? requestedGradeOverride : (targetGrade || undefined);
      const res = await fetch('/api/student/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: nameToFetch.trim(),
          className: classToFetch?.trim() || undefined,
          ...(activeRequestedGrade ? { requestedGrade: activeRequestedGrade } : {}),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Could not load your student portal.');
      }

      setData(json);
      setIsLoggedIn(true);
      // Remember credentials in localStorage
      const storagePrefix = targetGrade ? `math_portal_g${targetGrade}_` : 'math_portal_';
      localStorage.setItem(`${storagePrefix}student_name`, nameToFetch.trim());
      localStorage.setItem('math_portal_student_name', nameToFetch.trim());
      if (classToFetch) {
        localStorage.setItem(`${storagePrefix}student_class`, classToFetch.trim());
        localStorage.setItem('math_portal_student_class', classToFetch.trim());
      }
    } catch (e: any) {
      if (!silent) {
        setError(e.message || 'Error connecting to student portal.');
        setIsLoggedIn(false);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!studentName.trim()) return;
    loadPortalData(studentName, className);
  }

  function handleLogout() {
    const storagePrefix = targetGrade ? `math_portal_g${targetGrade}_` : 'math_portal_';
    localStorage.removeItem(`${storagePrefix}student_name`);
    localStorage.removeItem(`${storagePrefix}student_class`);
    localStorage.removeItem('math_portal_student_name');
    localStorage.removeItem('math_portal_student_class');
    setIsLoggedIn(false);
    setData(null);
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const parentUrl = data?.student.parentToken ? `${origin}/p/${data.student.parentToken}` : '';

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--theme-page-bg)',
        color: 'var(--theme-navy)',
        padding: '24px 16px 80px 16px',
        transition: 'background-color 0.2s ease, color 0.2s ease',
      }}
    >
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 20,
            right: 20,
            zIndex: 9999,
            backgroundColor: 'var(--theme-navy)',
            color: '#ffffff',
            padding: '12px 20px',
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            fontWeight: 800,
            fontSize: '0.9rem',
          }}
        >
          {toast}
        </div>
      )}

      <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Top Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/logo.png" alt="Math Logo" style={{ height: 42, width: 'auto', objectFit: 'contain' }} />
            <div>
              <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 900, color: 'var(--theme-navy)' }}>
                {targetGrade ? `មជ្ឈមណ្ឌលសិស្ស ${targetNameKh} (${targetNameEn} Portal)` : 'មជ្ឈមណ្ឌលសិស្ស (Student Portal)'}
              </h1>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isLoggedIn && (
              <button
                type="button"
                onClick={() => {
                  loadPortalData(studentName, className, undefined, false);
                  showToast('🔄 ទិន្នន័យបានធ្វើបច្ចុប្បន្នភាពរួចរាល់! (Portal Updated)');
                }}
                disabled={loading}
                className="btn small secondary"
                style={{ borderRadius: 10, padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 5 }}
                title="ធ្វើបច្ចុប្បន្នភាពទិន្នន័យភ្លាមៗ (Refresh Data)"
              >
                <RefreshCw size={15} className={loading ? 'spin' : ''} />
              </button>
            )}

            <button
              type="button"
              onClick={toggleTheme}
              className="btn small secondary"
              style={{ borderRadius: 10, padding: '7px 10px' }}
              aria-label="Toggle theme"
            >
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </button>

            {isLoggedIn && (
              <button
                type="button"
                onClick={handleLogout}
                className="btn small secondary"
                style={{
                  borderRadius: 10,
                  padding: '7px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontWeight: 700,
                  fontSize: '0.82rem',
                }}
              >
                <LogOut size={14} />
                <span>ប្តូរឈ្មោះ</span>
              </button>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* UNLOGGED VIEW: NAME ENTRY SCREEN */}
        {/* ========================================================================= */}
        {!isLoggedIn && (
          <div
            style={{
              maxWidth: 480,
              width: '100%',
              margin: '30px auto',
              backgroundColor: 'var(--theme-card-bg)',
              borderRadius: 22,
              padding: '30px 24px',
              border: '1px solid var(--theme-border)',
              boxShadow: 'var(--theme-shadow)',
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 18,
                  backgroundColor: 'rgba(74, 103, 214, 0.12)',
                  color: 'var(--theme-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 14px',
                }}
              >
                <UserCheck size={28} />
              </div>
              <h2 style={{ margin: '0 0 6px 0', fontSize: '1.35rem', fontWeight: 900, color: 'var(--theme-navy)' }}>
                {targetGrade ? `សូមបញ្ចូលឈ្មោះរបស់អ្នកដើម្បីចូលរៀន ${targetNameKh}` : 'សូមបញ្ចូលឈ្មោះរបស់អ្នកដើម្បីចូលរៀន'}
              </h2>
              <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--theme-muted)' }}>
                {targetGrade
                  ? `ប្រព័ន្ធនឹងផ្ទៀងផ្ទាត់បញ្ជីឈ្មោះសិស្ស${targetNameKh} និងបង្ហាញលំហាត់ដែលត្រូវរៀន`
                  : 'ប្រព័ន្ធនឹងបង្ហាញលំហាត់តាមកម្រិតថ្នាក់របស់អ្នកដោយស្វ័យប្រវត្តិ'}
              </p>
            </div>

            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {error && (
                <div
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#dc2626',
                    padding: '12px 14px',
                    borderRadius: 12,
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    lineHeight: 1.5,
                  }}
                >
                  <div>{error}</div>
                  <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(239, 68, 68, 0.2)' }}>
                    <Link
                      href="/register"
                      style={{
                        color: '#b91c1c',
                        fontWeight: 800,
                        fontSize: '0.86rem',
                        textDecoration: 'underline',
                      }}
                    >
                      👉 ចុចទីនេះដើម្បីចុះឈ្មោះថ្មី (Click here to register)
                    </Link>
                  </div>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 800, marginBottom: 6 }}>
                  ឈ្មោះសិស្ស (Student Name) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="ឧ. ស៊ុន ដារ៉ា ឬ Sok Dara"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '13px 16px',
                    borderRadius: 12,
                    border: '1.5px solid var(--theme-border)',
                    backgroundColor: 'var(--theme-page-bg)',
                    color: 'var(--theme-navy)',
                    fontSize: '1.05rem',
                    fontWeight: 700,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={loading || !studentName.trim()}
                style={{
                  padding: '14px 20px',
                  borderRadius: 12,
                  backgroundColor: 'var(--theme-primary)',
                  color: '#ffffff',
                  fontSize: '1.05rem',
                  fontWeight: 900,
                  border: 'none',
                  cursor: loading || !studentName.trim() ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 14px rgba(37,99,235,0.25)',
                  marginTop: 8,
                }}
              >
                {loading ? 'កំពុងផ្ទៀងផ្ទាត់…' : 'ចូលរៀន (Enter Portal)'}
              </button>
            </form>

            <div
              style={{
                marginTop: 20,
                paddingTop: 16,
                borderTop: '1px solid var(--theme-border)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '0.86rem', color: 'var(--theme-muted)', marginBottom: 8 }}>
                សិស្សថ្មីមិនទាន់បានចុះឈ្មោះ?
              </div>
              <Link
                href="/register"
                className="btn secondary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  borderRadius: 12,
                  padding: '9px 18px',
                  fontWeight: 800,
                  fontSize: '0.88rem',
                  color: 'var(--brand)',
                  borderColor: 'var(--brand)',
                  backgroundColor: 'rgba(74, 103, 214, 0.08)',
                  textDecoration: 'none',
                }}
              >
                <Sparkles size={16} />
                <span>ចុះឈ្មោះឈ្មោះ និងថ្នាក់នៅទីនេះ (New Student Register)</span>
              </Link>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* LOGGED IN VIEW: STUDENT DASHBOARD */}
        {/* ========================================================================= */}
        {isLoggedIn && data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Student Welcome Banner */}
            <div
              style={{
                backgroundColor: 'var(--theme-card-bg)',
                borderRadius: 20,
                padding: '20px 22px',
                border: '1px solid var(--theme-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 14,
                boxShadow: 'var(--theme-shadow)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 900, color: 'var(--theme-navy)' }}>
                    សួស្តី, {data.student.name}!
                  </h2>
                  {(() => {
                    const rawGrades = Array.isArray(data.student.grades) && data.student.grades.length > 0
                      ? data.student.grades
                      : (data.student.grade ? [data.student.grade] : []);
                    const enrolledGrades = Array.from(new Set(rawGrades.filter(Boolean))).sort((a, b) => a - b);
                    
                    return enrolledGrades.map((g) => {
                      const isActive = data.student.grade === g;
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() => {
                            if (g !== data.student.grade) {
                              loadPortalData(studentName || data.student.name, className || data.student.className || undefined, g);
                            }
                          }}
                          title={`ចុចដើម្បីប្តូរទៅមើលលំហាត់${gradeLabelKh(g, gradeCodes)}`}
                          style={{
                            padding: '4px 12px',
                            borderRadius: 20,
                            backgroundColor: isActive ? 'var(--theme-primary)' : 'rgba(74, 103, 214, 0.1)',
                            color: isActive ? '#ffffff' : 'var(--theme-primary)',
                            border: isActive ? '1px solid var(--theme-primary)' : '1px solid rgba(74, 103, 214, 0.25)',
                            fontWeight: 800,
                            fontSize: '0.85rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            cursor: enrolledGrades.length > 1 ? 'pointer' : 'default',
                            boxShadow: isActive ? '0 2px 8px rgba(37,99,235,0.25)' : 'none',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <span>📚</span>
                          <span>{gradeLabelBoth(g, gradeCodes)}</span>
                          {isActive && enrolledGrades.length > 1 && <span style={{ fontSize: '0.75rem' }}>✓</span>}
                        </button>
                      );
                    });
                  })()}
                  {data.student.className && (
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: 20,
                        backgroundColor: 'var(--theme-page-bg)',
                        border: '1px solid var(--theme-border)',
                        color: 'var(--theme-muted)',
                        fontWeight: 700,
                        fontSize: '0.82rem',
                      }}
                    >
                      {data.student.className}
                    </span>
                  )}
                </div>

              </div>

              {/* Parent Link Shortcut */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {data.student.studentToken && (
                  <button
                    type="button"
                    onClick={() => {
                      const url = `${window.location.origin}/s/${data.student.studentToken}`;
                      navigator.clipboard.writeText(url);
                      showToast('📋 បានចម្លងតំណផ្ទាល់ខ្លួន (Personal Link Copied!)');
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '9px 16px',
                      borderRadius: 12,
                      backgroundColor: 'rgba(59, 130, 246, 0.12)',
                      color: 'var(--theme-primary)',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                    }}
                  >
                    <Copy size={15} />
                    <span>តំណផ្ទាល់ខ្លួន (My Link)</span>
                  </button>
                )}

                {data.student.parentToken && (
                  <button
                    type="button"
                    onClick={() => setShowParentModal(true)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '9px 16px',
                      borderRadius: 12,
                      backgroundColor: 'rgba(16, 185, 129, 0.12)',
                      color: '#059669',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                    }}
                  >
                    <QrCode size={16} />
                    <span>តំណឪពុកម្តាយ (Parent Link)</span>
                  </button>
                )}
              </div>
            </div>


            {/* Pending Payment Notice */}
            {data.student.paymentStatus === 'pending' && (
              <div
                style={{
                  backgroundColor: 'rgba(245, 158, 11, 0.1)',
                  border: '1.5px solid rgba(245, 158, 11, 0.4)',
                  borderRadius: 16,
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 14,
                }}
              >
                <AlertCircle size={24} color="#d97706" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.98rem', color: '#b45309', marginBottom: 4 }}>
                    ⏳ រង់ចាំការអនុញ្ញាតបង់ប្រាក់ពីគ្រូ (Pending Teacher Payment Approval)
                  </div>
                  <div style={{ fontSize: '0.86rem', color: 'var(--theme-navy)', lineHeight: 1.5 }}>
                    អ្នកអាចសាកល្បងធ្វើ <strong>លំហាត់គំរូសាកល្បង (Sample Test Exercises)</strong> បានដោយសេរី។ លំហាត់ធម្មតាផ្សេងទៀតនឹងត្រូវបានបើកជូនភ្លាមៗ បន្ទាប់ពីលោកគ្រូ/អ្នកគ្រូបានអនុម័តការបង់ប្រាក់រួចរាល់។
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 1: AVAILABLE NOW */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#059669' }} />
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: 'var(--theme-navy)' }}>
                  លំហាត់ (Exercises)
                </h3>
              </div>

              {data.availableNow.length === 0 ? (
                <div
                  style={{
                    backgroundColor: 'var(--theme-card-bg)',
                    borderRadius: 16,
                    padding: 30,
                    textAlign: 'center',
                    border: '1px solid var(--theme-border)',
                    color: 'var(--theme-muted)',
                  }}
                >
                  <CheckCircle2 size={32} color="#059669" style={{ margin: '0 auto 8px', opacity: 0.8 }} />
                  <p style={{ margin: 0, fontWeight: 700 }}>
                    អ្នកបានបញ្ចប់រាល់លំហាត់ដែលបានបើកសម្រាប់{gradeLabelKh(data.student.grade, gradeCodes)} ហើយ!
                  </p>
                </div>
              ) : (
                (() => {
                  // Group available exercises by Chapter
                  const groups: { [key: string]: typeof data.availableNow } = {};
                  data.availableNow.forEach((ex) => {
                    const ch = (ex.chapter && ex.chapter.trim()) ? ex.chapter.trim() : 'លំហាត់ទូទៅ (General Exercises)';
                    if (!groups[ch]) groups[ch] = [];
                    groups[ch].push(ex);
                  });

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                      {Object.entries(groups).map(([chapterTitle, chapterExercises]) => {
                        const isGeneral = chapterTitle === 'លំហាត់ទូទៅ (General Exercises)';
                        const isCollapsed = collapsedChapters[chapterTitle] ?? false;

                        return (
                          <div
                            key={chapterTitle}
                            style={{
                              backgroundColor: 'var(--theme-card-bg)',
                              borderRadius: 18,
                              border: '1.5px solid var(--theme-border)',
                              overflow: 'hidden',
                              boxShadow: 'var(--theme-shadow)',
                            }}
                          >
                            {/* Chapter Header / Toggle */}
                            <div
                              onClick={() => toggleChapter(chapterTitle)}
                              style={{
                                padding: '14px 20px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                cursor: 'pointer',
                                backgroundColor: isCollapsed ? 'transparent' : 'rgba(59, 130, 246, 0.05)',
                                borderBottom: isCollapsed ? 'none' : '1px solid var(--theme-border)',
                                userSelect: 'none',
                                transition: 'background-color 0.15s ease',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                <div
                                  style={{
                                    width: 34,
                                    height: 34,
                                    borderRadius: 10,
                                    backgroundColor: isGeneral ? 'rgba(156, 163, 175, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                                    color: isGeneral ? 'var(--theme-muted)' : 'var(--theme-primary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                  }}
                                >
                                  {isGeneral ? <Folder size={18} /> : <span>📚</span>}
                                </div>
                                <div>
                                  <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--theme-navy)' }}>
                                    {chapterTitle}
                                  </h4>
                                  <div style={{ fontSize: '0.78rem', color: 'var(--theme-muted)', marginTop: 2 }}>
                                  </div>
                                </div>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--theme-muted)' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                                  {isCollapsed ? 'ពង្រីក (Show)' : 'បង្រួម (Hide)'}
                                </span>
                                {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                              </div>
                            </div>

                            {/* Chapter Exercises List */}
                            {!isCollapsed && (
                              <div style={{ padding: 12 }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                  {chapterExercises.map((ex) => {
                                    const href = data.student.studentToken ? `/e/${ex.id}?token=${encodeURIComponent(data.student.studentToken)}` : `/e/${ex.id}`;
                                    const row: React.CSSProperties = {
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      gap: 10,
                                      padding: '10px 14px',
                                      borderRadius: 12,
                                      backgroundColor: 'var(--theme-page-bg)',
                                      border: '1px solid var(--theme-border)',
                                      textDecoration: 'none',
                                      color: 'var(--theme-navy)',
                                    };
                                    const inner = (
                                      <>
                                        <div style={{ minWidth: 0 }}>
                                          <div style={{ fontWeight: 800, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {ex.isSample ? '🌟 ' : ''}{ex.title}
                                          </div>
                                          <div style={{ fontSize: '0.76rem', color: 'var(--theme-muted)', marginTop: 2 }}>
                                            {ex.questionCount} សំណួរ{ex.timeLimitMinutes > 0 ? ` • ${ex.timeLimitMinutes} នាទី` : ''}
                                            {ex.isSample && (
                                              <div style={{ color: '#059669', fontWeight: 800, marginTop: 2 }}>🌟 លំហាត់សាកល្បងឥតគិតថ្លៃ (Free Trial)</div>
                                            )}
                                          </div>
                                        </div>
                                        {ex.isLockedForPayment ? (
                                          <Lock size={16} color="var(--theme-muted)" />
                                        ) : (
                                          <span
                                            style={{
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: 6,
                                              padding: '7px 14px',
                                              borderRadius: 10,
                                              backgroundColor: ex.isSample ? '#10b981' : 'var(--theme-primary)',
                                              color: '#ffffff',
                                              fontWeight: 800,
                                              fontSize: '0.88rem',
                                              flexShrink: 0,
                                            }}
                                          >
                                            ចូលធ្វើ <ChevronRight size={15} />
                                          </span>
                                        )}
                                      </>
                                    );
                                    return ex.isLockedForPayment ? (
                                      <div key={ex.id} style={{ ...row, opacity: 0.6, cursor: 'not-allowed' }}>{inner}</div>
                                    ) : (
                                      <Link key={ex.id} href={href} style={row}>{inner}</Link>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()
              )}
            </div>

            {/* SECTION 3: COMPLETED EXERCISES & SCORES */}
            {data.completed.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Award size={18} color="#059669" />
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: 'var(--theme-navy)' }}>
                    លំហាត់ដែលបានធ្វើរួច (Completed Exercises — {data.completed.length})
                  </h3>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {data.completed.map((sub) => {
                    const isGood = sub.percentage >= 80;
                    const isFair = sub.percentage >= 50 && sub.percentage < 80;
                    const badgeColor = isGood ? '#059669' : isFair ? '#d97706' : '#dc2626';
                    const badgeBg = isGood
                      ? 'rgba(5, 150, 105, 0.12)'
                      : isFair
                      ? 'rgba(217, 119, 6, 0.12)'
                      : 'rgba(220, 38, 38, 0.12)';

                    return (
                      <div
                        key={sub.submissionId}
                        style={{
                          backgroundColor: 'var(--theme-card-bg)',
                          borderRadius: 14,
                          padding: '14px 18px',
                          border: '1px solid var(--theme-border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: 12,
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '1.02rem', color: 'var(--theme-navy)' }}>
                            {sub.title}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--theme-muted)', marginTop: 2 }}>
                            បានបញ្ជូននៅ ៖ {new Date(sub.submittedAt).toLocaleDateString()}
                            {sub.late && <span style={{ color: '#dc2626', marginLeft: 8 }}>• បញ្ជូនយឺត</span>}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 900, fontSize: '1.15rem', color: badgeColor }}>
                              {sub.score} / {sub.total}
                            </div>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '2px 8px',
                                borderRadius: 8,
                                backgroundColor: badgeBg,
                                color: badgeColor,
                                fontSize: '0.78rem',
                                fontWeight: 800,
                              }}
                            >
                              {sub.percentage}%
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Parent Link QR Code Modal */}
        {showParentModal && parentUrl && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(3px)',
              zIndex: 999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
            onClick={() => setShowParentModal(false)}
          >
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: 22,
                padding: '28px 24px',
                maxWidth: 360,
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                color: '#0f172a',
                boxShadow: '0 24px 48px rgba(0,0,0,0.25)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: '0 0 4px 0', fontSize: '1.25rem', fontWeight: 900 }}>
                តំណសម្រាប់ឪពុកម្តាយ
              </h3>
              <p style={{ margin: '0 0 16px 0', fontSize: '0.82rem', color: '#64748b' }}>
                ឪពុកម្តាយអាចស្កេនដើម្បីមើលលទ្ធផលរៀនរបស់អ្នក
              </p>

              <div
                style={{
                  padding: 14,
                  backgroundColor: '#f8fafc',
                  borderRadius: 16,
                  border: '1px solid #e2e8f0',
                  marginBottom: 16,
                }}
              >
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(parentUrl)}`}
                  alt="Parent QR"
                  style={{ width: 180, height: 180, display: 'block' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, width: '100%' }}>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(parentUrl);
                    showToast('បានចម្លងតំណឪពុកម្តាយរួចរាល់!');
                  }}
                  style={{
                    flex: 1,
                    padding: '11px 16px',
                    borderRadius: 12,
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: '0.88rem',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <Copy size={16} />
                  <span>ចម្លងតំណ</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowParentModal(false)}
                  style={{
                    padding: '11px 18px',
                    borderRadius: 12,
                    backgroundColor: '#f1f5f9',
                    color: '#475569',
                    fontWeight: 700,
                    fontSize: '0.88rem',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  បិទ
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
