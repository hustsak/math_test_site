'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';
import { QRCodeSVG } from 'qrcode.react';
import {
  LayoutDashboard,
  BookOpen,
  Users,
  Settings,
  LogOut,
  Search,
  Bell,
  Sun,
  Moon,
  QrCode,
  MoreVertical,
  Copy,
  Edit3,
  CopyPlus,
  Trash2,
  Plus,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  UserPlus,
  UserX,
  Sparkles,
  MessageSquare,
  Check,
  ArrowRight,
  TrendingUp,
  X,
  LogIn,
  Menu,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FolderSymlink,
  Layers,
} from 'lucide-react';
import { getAuthClient, getDb } from '@/lib/firebaseClient';
import { useAdmin } from '@/lib/useAdmin';
import { adminPost } from '@/lib/authFetch';
import { CAMBODIAN_MATH_CURRICULUM } from '@/lib/curriculum';
import type { Exercise, Submission, Student } from '@/lib/types';

type Row = { id: string } & Exercise;
type SubRow = { id: string } & Submission;

export default function AdminHome() {
  const { user, isAdmin, loading: authLoading } = useAdmin();

  // Theme state
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  // Language state: 'EN' | 'KH'
  const [lang, setLang] = useState<'EN' | 'KH'>('EN');

  // Auth form states (when unauthenticated)
  const [authMode, setAuthMode] = useState<'login' | 'register'>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      if (p.get('mode') === 'register' || p.get('register') === 'true' || window.location.hash === '#register') {
        return 'register';
      }
    }
    return 'login';
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  // Data states
  const [exercises, setExercises] = useState<Row[] | null>(null);
  const [submissions, setSubmissions] = useState<SubRow[] | null>(null);
  const [rosterStudents, setRosterStudents] = useState<Student[]>([]);
  const [showClassAverage, setShowClassAverage] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState('');

  // UI Filter / Search
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'published' | 'scheduled' | 'draft'>('all');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [selectedChapter, setSelectedChapter] = useState<string>('all');
  const [collapsedAdminChapters, setCollapsedAdminChapters] = useState<Record<string, boolean>>({});

  const toggleAdminChapter = (chapterKey: string) => {
    setCollapsedAdminChapters((prev) => ({
      ...prev,
      [chapterKey]: !prev[chapterKey],
    }));
  };

  // Modals & Popups
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [qrModalEx, setQrModalEx] = useState<Row | null>(null);
  const [deleteConfirmEx, setDeleteConfirmEx] = useState<Row | null>(null);
  const [unsubmittedModalEx, setUnsubmittedModalEx] = useState<Row | null>(null);
  const [showAddTeacherModal, setShowAddTeacherModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [moveModalEx, setMoveModalEx] = useState<Row | null>(null);
  const [moveGrades, setMoveGrades] = useState<number[]>([]);
  const [moveChapter, setMoveChapter] = useState<string>('');
  const [moveBusy, setMoveBusy] = useState(false);

  // Register another teacher form states
  const [newTeacherEmail, setNewTeacherEmail] = useState('');
  const [newTeacherPassword, setNewTeacherPassword] = useState('');
  const [newTeacherConfirm, setNewTeacherConfirm] = useState('');
  const [addTeacherError, setAddTeacherError] = useState('');
  const [addTeacherSuccess, setAddTeacherSuccess] = useState('');
  const [addTeacherBusy, setAddTeacherBusy] = useState(false);

  // Toast feedback
  const [toastMsg, setToastMsg] = useState('');

  // Mobile & Laptop Responsive States
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<'dashboard' | 'exercises'>('dashboard');

  function scrollToSection(sectionId: string, sectionKey?: typeof activeSection) {
    if (sectionKey) setActiveSection(sectionKey);
    setMobileMenuOpen(false);
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // Close menus on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest('.action-menu-container')) {
        setActiveMenuId(null);
      }
      if (!(e.target as HTMLElement).closest('.notif-container')) {
        setShowNotifications(false);
      }
    }
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // Theme and initial URL query params
  useEffect(() => {
    const savedTheme = localStorage.getItem('mathtest_theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }

    function syncMode() {
      if (typeof window !== 'undefined') {
        const p = new URLSearchParams(window.location.search);
        if (p.get('mode') === 'register' || p.get('register') === 'true' || window.location.hash === '#register') {
          setAuthMode('register');
        } else if (p.get('mode') === 'login') {
          setAuthMode('login');
        }
      }
    }

    syncMode();
    window.addEventListener('popstate', syncMode);
    return () => window.removeEventListener('popstate', syncMode);
  }, []);

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('mathtest_theme', next);
    document.documentElement.setAttribute('data-theme', next);
  }

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? '' : prev));
    }, 2800);
  }

  // Load Firestore data
  async function loadData() {
    setLoadingData(true);
    setDataError('');
    try {
      const [exSnap, subSnap, profilesSnap, legacyStudentsSnap, settingsSnap] = await Promise.all([
        getDocs(query(collection(getDb(), 'exercises'), orderBy('updatedAt', 'desc'))),
        getDocs(collection(getDb(), 'submissions')),
        getDocs(collection(getDb(), 'profiles')).catch(() => null),
        getDocs(collection(getDb(), 'students')).catch(() => null),
        getDoc(doc(getDb(), 'settings', 'app')).catch(() => null),
      ]);

      const exList = exSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Exercise) }));
      const subList = subSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Submission) }));

      setExercises(exList);
      setSubmissions(subList);

      if (profilesSnap && !profilesSnap.empty) {
        const pList = profilesSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((p) => !p.hidden);
        setRosterStudents(pList as any);
      } else if (legacyStudentsSnap) {
        const sList = legacyStudentsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        setRosterStudents(sList);
      }

      if (settingsSnap && settingsSnap.exists()) {
        setShowClassAverage(!!settingsSnap.data()?.showClassAverageToParents);
      }
    } catch (err: any) {
      setDataError(err?.message || 'Could not load data.');
    } finally {
      setLoadingData(false);
    }
  }

  async function handleToggleClassAverage(val: boolean) {
    setShowClassAverage(val);
    try {
      await adminPost('/api/admin/settings', { showClassAverageToParents: val });
      showToast(val ? 'Class average is now visible to parents' : 'Class average hidden from parents');
    } catch (e: any) {
      alert('Failed to update setting: ' + (e?.message || 'Error'));
    }
  }

  function getUnsubmittedStudents(exerciseId: string) {
    if (!rosterStudents.length) return [];
    const exerciseSubs = (submissions || []).filter(
      (s) => s.exerciseId === exerciseId && s.status === 'submitted'
    );
    const submittedProfileIds = new Set(
      exerciseSubs.map((s) => s.profileId).filter(Boolean)
    );
    const submittedStudentIds = new Set(
      exerciseSubs.map((s) => s.studentId).filter(Boolean)
    );
    const submittedNameKeys = new Set(
      exerciseSubs.map((s) => s.nameKey || s.studentName.trim().toLowerCase())
    );

    return rosterStudents.filter((student: any) => {
      if (student.hidden === true || student.active === false) return false;
      if (submittedProfileIds.has(student.id) || submittedStudentIds.has(student.id)) return false;
      const key = student.name.trim().toLowerCase();
      if (submittedNameKeys.has(key)) return false;
      return true;
    });
  }

  useEffect(() => {
    if (isAdmin) {
      loadData();
    }
  }, [isAdmin]);

  // Auth Form Handlers (Sign In & Register)
  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    setAuthBusy(true);
    try {
      await signInWithEmailAndPassword(getAuthClient(), email.trim(), password);
    } catch (err: any) {
      const code = err?.code;
      if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
      ) {
        setAuthError(lang === 'KH' ? 'អ៊ីមែល ឬ ពាក្យសម្ងាត់មិនត្រឹមត្រូវទេ។' : 'Incorrect email or password.');
      } else if (code === 'auth/invalid-email') {
        setAuthError(lang === 'KH' ? 'សូមបញ្ចូលអ៊ីមែលដែលត្រឹមត្រូវ។' : 'Please enter a valid email address.');
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
      setAuthError(lang === 'KH' ? 'ពាក្យសម្ងាត់ផ្ទៀងផ្ទាត់មិនត្រូវគ្នាទេ។' : 'Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setAuthError(lang === 'KH' ? 'ពាក្យសម្ងាត់ត្រូវមានយ៉ាងហោចណាស់ ៦ តួអក្សរ។' : 'Password must be at least 6 characters.');
      return;
    }
    setAuthBusy(true);
    try {
      await createUserWithEmailAndPassword(getAuthClient(), email.trim(), password);
    } catch (err: any) {
      const code = err?.code;
      if (code === 'auth/email-already-in-use') {
        setAuthError(
          lang === 'KH'
            ? 'គណនីជាមួយអ៊ីមែលនេះមានរួចហើយ។ សូមចូលប្រើប្រាស់។'
            : 'An account with this email already exists. Please sign in.'
        );
      } else if (code === 'auth/invalid-email') {
        setAuthError(lang === 'KH' ? 'សូមបញ្ចូលអ៊ីមែលដែលត្រឹមត្រូវ។' : 'Please enter a valid email address.');
      } else if (code === 'auth/weak-password') {
        setAuthError(lang === 'KH' ? 'ពាក្យសម្ងាត់ខ្សោយពេក។' : 'Password is too weak. Please use at least 6 characters.');
      } else {
        setAuthError(err?.message || 'Registration failed.');
      }
    } finally {
      setAuthBusy(false);
    }
  }

  // Register another teacher from modal
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
        setAddTeacherSuccess(`Teacher account created for ${newTeacherEmail.trim()}!`);
        new Audio('/sounds/success.mp3')?.play?.().catch(() => {});
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

  // Exercise Actions
  async function handleDeleteExercise(id: string) {
    try {
      await deleteDoc(doc(getDb(), 'exercises', id));
      setDeleteConfirmEx(null);
      showToast('Exercise deleted successfully');
      loadData();
    } catch (e: any) {
      alert(e?.message || 'Failed to delete exercise.');
    }
  }

  async function handleDuplicateExercise(r: Row) {
    const { id: _id, ...rest } = r;
    const now = Date.now();
    try {
      await addDoc(collection(getDb(), 'exercises'), {
        ...rest,
        title: `${r.title || 'Untitled'} (Copy)`,
        published: false,
        createdAt: now,
        updatedAt: now,
      });
      showToast('Exercise duplicated');
      loadData();
    } catch (e: any) {
      alert(e?.message || 'Failed to duplicate exercise.');
    }
  }

  async function handleMoveExercise(r: Row, newGrades: number[], newChapter: string) {
    if (!newGrades.length) {
      alert(lang === 'KH' ? 'សូមជ្រើសរើសកម្រិតថ្នាក់យ៉ាងហោចណាស់មួយ។' : 'Please select at least one grade.');
      return;
    }
    setMoveBusy(true);
    try {
      const docRef = doc(getDb(), 'exercises', r.id);
      const trimmedChapter = newChapter.trim();
      await updateDoc(docRef, {
        gradeLevels: newGrades.sort((a, b) => a - b),
        chapter: trimmedChapter || '',
        updatedAt: Date.now(),
      });
      const chMsg = trimmedChapter ? (lang === 'KH' ? ` ក្នុង${trimmedChapter}` : ` to chapter "${trimmedChapter}"`) : '';
      showToast(lang === 'KH' ? `បានប្តូរទៅថ្នាក់ទី ${newGrades.join(', ')}${chMsg} ដោយជោគជ័យ!` : `Moved to Grade ${newGrades.join(', ')}${chMsg}!`);
      setMoveModalEx(null);
      loadData();
    } catch (e: any) {
      alert(e?.message || 'Failed to move exercise.');
    } finally {
      setMoveBusy(false);
    }
  }

  async function copyStudentLink(id: string) {
    const url = `${window.location.origin}/e/${id}`;
    await navigator.clipboard.writeText(url);
    showToast('Link copied to clipboard!');
  }

  // Analytics & Derived Data Calculations
  const submittedList = useMemo(() => {
    return (submissions || []).filter((s) => s.status === 'submitted');
  }, [submissions]);

  // Submissions today
  const submissionsToday = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const ts = startOfToday.getTime();
    return (submissions || []).filter((s) => (s.submittedAt ?? 0) >= ts);
  }, [submissions]);

  // Overall average score
  const overallAvgScore = useMemo(() => {
    if (!submittedList.length) return 0;
    const totalPct = submittedList.reduce((acc, s) => {
      const pct = ((s.score ?? 0) / Math.max(1, s.total ?? 1)) * 100;
      return acc + pct;
    }, 0);
    return (totalPct / submittedList.length).toFixed(1);
  }, [submittedList]);

  // Exercise Submissions Map & Avg Map
  const exStats = useMemo(() => {
    const map = new Map<string, { count: number; avg: number; submissions: SubRow[] }>();
    for (const ex of exercises || []) {
      const subs = (submissions || []).filter((s) => s.exerciseId === ex.id);
      const done = subs.filter((s) => s.status === 'submitted');
      const avg = done.length
        ? done.reduce((a, s) => a + ((s.score ?? 0) / Math.max(1, s.total ?? 1)) * 100, 0) / done.length
        : 0;
      map.set(ex.id, { count: subs.length, avg, submissions: subs });
    }
    return map;
  }, [exercises, submissions]);

  // Upcoming Deadlines
  const upcomingDeadlines = useMemo(() => {
    const now = Date.now();
    return (exercises || [])
      .filter((e) => e.deadline && new Date(e.deadline).getTime() > now)
      .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
      .slice(0, 5)
      .map((e) => {
        const dueTime = new Date(e.deadline!).getTime();
        const diffMs = dueTime - now;
        const diffHours = Math.round(diffMs / (1000 * 60 * 60));
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        const isUrgent = diffHours < 24;
        const countdownText = isUrgent
          ? diffHours <= 1
            ? 'Closes in under 1 hour'
            : `Closes in ${diffHours} hours`
          : `Closes in ${diffDays} days`;
        return {
          ...e,
          countdownText,
          isUrgent,
        };
      });
  }, [exercises]);

  // 6 Permanent Grade Folders definition
  const GRADE_FOLDERS = [
    { grade: 7, labelKh: 'ថ្នាក់ទី ៧', labelEn: 'Grade 7', color: '#2563eb', bg: 'rgba(37, 99, 235, 0.08)' },
    { grade: 8, labelKh: 'ថ្នាក់ទី ៨', labelEn: 'Grade 8', color: '#7c3aed', bg: 'rgba(124, 58, 237, 0.08)' },
    { grade: 9, labelKh: 'ថ្នាក់ទី ៩', labelEn: 'Grade 9', color: '#db2777', bg: 'rgba(219, 39, 119, 0.08)' },
    { grade: 10, labelKh: 'ថ្នាក់ទី ១០', labelEn: 'Grade 10', color: '#059669', bg: 'rgba(5, 150, 105, 0.08)' },
    { grade: 11, labelKh: 'ថ្នាក់ទី ១១', labelEn: 'Grade 11', color: '#d97706', bg: 'rgba(217, 119, 6, 0.08)' },
    { grade: 12, labelKh: 'ថ្នាក់ទី ១២', labelEn: 'Grade 12', color: '#dc2626', bg: 'rgba(220, 38, 38, 0.08)' },
  ];

  // Chapter list for current grade filter
  const availableChapters = useMemo(() => {
    const list: string[] = [];
    (exercises || []).forEach((e) => {
      if (gradeFilter !== 'all') {
        const gNum = Number(gradeFilter);
        if (e.gradeLevels && e.gradeLevels.length > 0 && !e.gradeLevels.includes(gNum)) return;
      }
      if (e.chapter && e.chapter.trim() && !list.includes(e.chapter.trim())) {
        list.push(e.chapter.trim());
      }
    });
    return list;
  }, [exercises, gradeFilter]);

  // Filtered exercises list
  const filteredExercises = useMemo(() => {
    const now = Date.now();
    return (exercises || []).filter((r) => {
      // Publication status filter
      if (filter === 'published') {
        const isScheduledFuture = r.published && r.publicationMode === 'scheduled' && r.scheduledPublishAt && new Date(r.scheduledPublishAt).getTime() > now;
        if (!r.published || r.publicationMode === 'draft' || isScheduledFuture) return false;
      } else if (filter === 'scheduled') {
        const isScheduled = r.publicationMode === 'scheduled' || (r.scheduledPublishAt && new Date(r.scheduledPublishAt).getTime() > now);
        if (!isScheduled) return false;
      } else if (filter === 'draft') {
        if (r.published && r.publicationMode !== 'draft') return false;
      }

      // Grade filter (7-12)
      if (gradeFilter !== 'all') {
        const gNum = Number(gradeFilter);
        if (r.gradeLevels && r.gradeLevels.length > 0 && !r.gradeLevels.includes(gNum)) {
          return false;
        }
      }

      // Chapter filter
      if (selectedChapter !== 'all') {
        if ((r.chapter || '') !== selectedChapter) return false;
      }

      // Search query
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchTitle = (r.title || '').toLowerCase().includes(q);
        const matchDesc = (r.description || '').toLowerCase().includes(q);
        const matchChapter = (r.chapter || '').toLowerCase().includes(q);
        const matchTopic = (r.topic || '').toLowerCase().includes(q);
        return matchTitle || matchDesc || matchChapter || matchTopic;
      }
      return true;
    });
  }, [exercises, filter, gradeFilter, selectedChapter, search]);

  const teacherName = useMemo(() => {
    if (!user?.email) return 'Teacher';
    const prefix = user.email.split('@')[0];
    return prefix.charAt(0).toUpperCase() + prefix.slice(1);
  }, [user]);

  // Loading skeleton state
  if (authLoading) {
    return (
      <div className="app-shell" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 460, padding: '32px 24px', margin: '0 14px' }} className="card skeleton">
          <div style={{ height: 28, width: '40%', marginBottom: 16 }} className="skeleton" />
          <div style={{ height: 16, width: '70%', marginBottom: 32 }} className="skeleton" />
          <div style={{ height: 48, marginBottom: 16 }} className="skeleton" />
          <div style={{ height: 48, marginBottom: 24 }} className="skeleton" />
          <div style={{ height: 44, borderRadius: 12 }} className="skeleton" />
        </div>
      </div>
    );
  }

  // =========================================================================
  // Unauthenticated: Teacher Sign In & Teacher Registration Screen
  // =========================================================================
  if (!user) {
    return (
      <div className="app-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '16px 12px' }}>
        <div
          style={{
            width: '100%',
            maxWidth: 480,
            backgroundColor: 'var(--theme-card-bg)',
            borderRadius: 24,
            padding: '30px 22px',
            boxShadow: 'var(--theme-shadow-hover)',
            border: '1px solid var(--theme-border)',
            position: 'relative',
            margin: 'auto',
          }}
        >
          {/* Top Header with Theme Switcher */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img
                src="/logo.png"
                alt="MathTest Logo"
                style={{ height: 46, width: 'auto', objectFit: 'contain' }}
              />
              <div>
                <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: 'var(--theme-navy)' }}>
                  MathTest
                </h2>
                <span style={{ fontSize: '0.8rem', color: 'var(--theme-muted)' }}>Teacher Portal</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setLang((prev) => (prev === 'EN' ? 'KH' : 'EN'))}
                className="btn small secondary"
                style={{ borderRadius: 8, padding: '4px 10px', fontSize: '0.8rem', fontWeight: 700 }}
              >
                {lang}
              </button>
              <button
                type="button"
                onClick={toggleTheme}
                className="btn small secondary"
                style={{ borderRadius: 8, padding: '6px 8px' }}
                aria-label="Toggle dark mode"
              >
                {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
              </button>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div
            style={{
              display: 'flex',
              backgroundColor: 'var(--theme-page-bg)',
              borderRadius: 14,
              padding: 4,
              marginBottom: 24,
              gap: 4,
            }}
          >
            <button
              type="button"
              onClick={() => {
                setAuthMode('login');
                setAuthError('');
              }}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: 10,
                border: 'none',
                background: authMode === 'login' ? 'var(--theme-card-bg)' : 'transparent',
                color: authMode === 'login' ? 'var(--theme-primary)' : 'var(--theme-muted)',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: authMode === 'login' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <LogIn size={16} />
              {lang === 'KH' ? 'ចូលគណនីគ្រូ' : 'Teacher Login'}
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('register');
                setAuthError('');
              }}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: 10,
                border: 'none',
                background: authMode === 'register' ? 'var(--theme-card-bg)' : 'transparent',
                color: authMode === 'register' ? 'var(--theme-primary)' : 'var(--theme-muted)',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: authMode === 'register' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <UserPlus size={16} />
              {lang === 'KH' ? 'ចុះឈ្មោះគ្រូថ្មី' : 'Register Account'}
            </button>
          </div>

          {authError && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 14px',
                borderRadius: 12,
                backgroundColor: 'var(--bad-bg)',
                color: 'var(--bad)',
                border: '1px solid #fed7d7',
                fontSize: '0.88rem',
                marginBottom: 18,
              }}
            >
              <AlertTriangle size={18} style={{ flexShrink: 0 }} />
              <span>{authError}</span>
            </div>
          )}

          {authMode === 'login' ? (
            <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--theme-navy)', fontWeight: 600 }}>
                  {lang === 'KH' ? 'អាសយដ្ឋានអ៊ីមែល' : 'Email Address'}
                </label>
                <input
                  type="email"
                  placeholder="teacher@school.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={{
                    backgroundColor: 'var(--theme-page-bg)',
                    borderColor: 'var(--theme-border)',
                    borderRadius: 12,
                    padding: '11px 14px',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--theme-navy)', fontWeight: 600 }}>
                  {lang === 'KH' ? 'ពាក្យសម្ងាត់' : 'Password'}
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{
                    backgroundColor: 'var(--theme-page-bg)',
                    borderColor: 'var(--theme-border)',
                    borderRadius: 12,
                    padding: '11px 14px',
                  }}
                />
              </div>

              <button
                type="submit"
                className="btn"
                disabled={authBusy}
                style={{
                  backgroundColor: 'var(--theme-primary)',
                  borderColor: 'var(--theme-primary)',
                  borderRadius: 12,
                  padding: '12px 16px',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  marginTop: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {authBusy ? (
                  lang === 'KH' ? 'កំពុងចូល…' : 'Signing in…'
                ) : (
                  <>
                    <LogIn size={18} />
                    {lang === 'KH' ? 'ចូលទៅផ្ទាំងគ្រប់គ្រង' : 'Sign In to Dashboard'}
                  </>
                )}
              </button>

              <div style={{ textAlign: 'center', marginTop: 8 }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--theme-muted)' }}>
                  {lang === 'KH' ? 'មិនទាន់មានគណនីគ្រូ?' : "Don't have a teacher account? "}{' '}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('register');
                    setAuthError('');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--theme-primary)',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    padding: 0,
                  }}
                >
                  {lang === 'KH' ? 'ចុះឈ្មោះនៅទីនេះ' : 'Register here'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--theme-navy)', fontWeight: 600 }}>
                  {lang === 'KH' ? 'អ៊ីមែលគ្រូបង្រៀន' : 'Teacher Email'}
                </label>
                <input
                  type="email"
                  placeholder="new.teacher@school.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={{
                    backgroundColor: 'var(--theme-page-bg)',
                    borderColor: 'var(--theme-border)',
                    borderRadius: 12,
                    padding: '11px 14px',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--theme-navy)', fontWeight: 600 }}>
                  {lang === 'KH' ? 'ពាក្យសម្ងាត់ (យ៉ាងតិច ៦ តួ)' : 'Password (min. 6 characters)'}
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{
                    backgroundColor: 'var(--theme-page-bg)',
                    borderColor: 'var(--theme-border)',
                    borderRadius: 12,
                    padding: '11px 14px',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--theme-navy)', fontWeight: 600 }}>
                  {lang === 'KH' ? 'ផ្ទៀងផ្ទាត់ពាក្យសម្ងាត់' : 'Confirm Password'}
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  style={{
                    backgroundColor: 'var(--theme-page-bg)',
                    borderColor: 'var(--theme-border)',
                    borderRadius: 12,
                    padding: '11px 14px',
                  }}
                />
              </div>

              <button
                type="submit"
                className="btn"
                disabled={authBusy}
                style={{
                  backgroundColor: 'var(--theme-primary)',
                  borderColor: 'var(--theme-primary)',
                  borderRadius: 12,
                  padding: '12px 16px',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  marginTop: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {authBusy ? (
                  lang === 'KH' ? 'កំពុងបង្កើត…' : 'Creating account…'
                ) : (
                  <>
                    <UserPlus size={18} />
                    {lang === 'KH' ? 'បង្កើតគណនីគ្រូ' : 'Create Teacher Account'}
                  </>
                )}
              </button>

              <div style={{ textAlign: 'center', marginTop: 8 }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--theme-muted)' }}>
                  {lang === 'KH' ? 'មានគណនីរួចហើយ?' : 'Already have an account? '}{' '}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setAuthError('');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--theme-primary)',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    padding: 0,
                  }}
                >
                  {lang === 'KH' ? 'ចូលគណនីនៅទីនេះ' : 'Sign in here'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // Authenticated Teacher Dashboard (Reference Layout Redesign)
  // =========================================================================
  return (
    <div className="app-shell">
      {/* Toast notification */}
      {toastMsg && (
        <div className="dashboard-toast">
          <CheckCircle2 size={18} color="#1faa6b" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Mobile Drawer (Accessible on mobile/tablet) */}
      {mobileMenuOpen && (
        <>
          <div className="mobile-drawer-backdrop" onClick={() => setMobileMenuOpen(false)} />
          <div className="mobile-drawer custom-scrollbar">
            {/* Drawer Header */}
            <div
              style={{
                padding: '20px 20px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid var(--theme-border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <img
                  src="/logo.png"
                  alt="MathTest Logo"
                  style={{ height: 38, width: 'auto', objectFit: 'contain' }}
                />
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--theme-navy)' }}>
                    MathTest
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--theme-muted)' }}>Teacher Workspace</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  border: 'none',
                  background: 'none',
                  color: 'var(--theme-muted)',
                  padding: 6,
                  cursor: 'pointer',
                  borderRadius: 8,
                }}
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>

            {/* Teacher Profile Card */}
            <div
              style={{
                padding: '14px 16px',
                margin: '14px 16px 10px',
                backgroundColor: 'var(--theme-page-bg)',
                borderRadius: 16,
                border: '1px solid var(--theme-border)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #4a67d6 0%, #3d56a6 100%)',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {teacherName.charAt(0)}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--theme-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {teacherName}
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--theme-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.email}
                </div>
              </div>
            </div>

            {/* Drawer Navigation Links */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 12px', flex: 1 }}>
              <button
                type="button"
                onClick={() => scrollToSection('dashboard-top', 'dashboard')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: 'none',
                  backgroundColor: activeSection === 'dashboard' ? 'rgba(74, 103, 214, 0.12)' : 'transparent',
                  color: activeSection === 'dashboard' ? 'var(--theme-primary)' : 'var(--theme-navy)',
                  fontWeight: activeSection === 'dashboard' ? 700 : 600,
                  fontSize: '0.92rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <LayoutDashboard size={18} />
                <span>Dashboard Overview</span>
              </button>

              <button
                type="button"
                onClick={() => scrollToSection('my-exercises-section', 'exercises')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: 'none',
                  backgroundColor: activeSection === 'exercises' ? 'rgba(74, 103, 214, 0.12)' : 'transparent',
                  color: activeSection === 'exercises' ? 'var(--theme-primary)' : 'var(--theme-navy)',
                  fontWeight: activeSection === 'exercises' ? 700 : 600,
                  fontSize: '0.92rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <BookOpen size={18} />
                <span>My Exercises ({exercises?.length ?? 0})</span>
              </button>

              <Link
                href="/admin/students"
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: 'var(--theme-navy)',
                  fontWeight: 600,
                  fontSize: '0.92rem',
                  textDecoration: 'none',
                }}
              >
                <Users size={18} />
                <span>Students & Access</span>
              </Link>

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setShowAddTeacherModal(true);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: 'var(--theme-navy)',
                  fontWeight: 600,
                  fontSize: '0.92rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <UserPlus size={18} />
                <span>+ Register Another Teacher</span>
              </button>
            </div>

            {/* Drawer Footer Preferences & Logout */}
            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--theme-border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setLang((p) => (p === 'EN' ? 'KH' : 'EN'))}
                  className="btn small secondary grow"
                  style={{ borderRadius: 10, padding: '8px 10px', fontSize: '0.82rem', fontWeight: 700 }}
                >
                  {lang === 'EN' ? '🇬🇧 English' : '🇰🇭 ភាសាខ្មែរ'}
                </button>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="btn small secondary"
                  style={{ borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}
                >
                  {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
                  <span>{theme === 'light' ? 'Dark' : 'Light'}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => signOut(getAuthClient())}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '11px 16px',
                  borderRadius: 12,
                  backgroundColor: 'rgba(217, 68, 60, 0.1)',
                  color: 'var(--theme-danger)',
                  border: '1px solid rgba(217, 68, 60, 0.2)',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                }}
              >
                <LogOut size={16} />
                <span>{lang === 'KH' ? 'ចាកចេញពីគណនី' : 'Sign Out'}</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Main App Container Shell */}
      <div className="shell-container">
        {/* =========================================================
            LEFT COLUMN 1: Narrow Royal Blue Rail (72px)
           ========================================================= */}
        <aside
          style={{
            width: 72,
            backgroundColor: 'var(--theme-sidebar-rail)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '24px 0',
            gap: 20,
            flexShrink: 0,
            transition: 'all 0.2s ease',
          }}
          className="hide-on-mobile"
        >
          {/* Logo Icon */}
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              backgroundColor: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 4,
              marginBottom: 10,
              boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
              overflow: 'hidden',
            }}
          >
            <img
              src="/logo.png"
              alt="MathTest Logo"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>

          {/* Quick rail action icons */}
          <button
            type="button"
            className="rail-icon-btn active"
            onClick={() => scrollToSection('dashboard-top', 'dashboard')}
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              backgroundColor: activeSection === 'dashboard' ? '#ffffff' : 'transparent',
              color: activeSection === 'dashboard' ? 'var(--theme-primary)' : 'rgba(255, 255, 255, 0.8)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Dashboard Overview"
          >
            <LayoutDashboard size={20} />
          </button>

          <button
            type="button"
            onClick={() => scrollToSection('my-exercises-section', 'exercises')}
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              backgroundColor: activeSection === 'exercises' ? '#ffffff' : 'transparent',
              color: activeSection === 'exercises' ? 'var(--theme-primary)' : 'rgba(255, 255, 255, 0.8)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Exercises"
          >
            <BookOpen size={20} />
          </button>

          {/* Laptop Toggle button to expand/collapse the 210px panel */}
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              backgroundColor: 'rgba(255, 255, 255, 0.16)',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 4,
            }}
            title={sidebarCollapsed ? 'Expand Sidebar Panel' : 'Collapse Sidebar for Wider View'}
          >
            {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>

          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
            <button
              type="button"
              onClick={toggleTheme}
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Toggle Theme"
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <button
              type="button"
              onClick={() => signOut(getAuthClient())}
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: 'rgba(217, 68, 60, 0.25)',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Log Out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </aside>

        {/* =========================================================
            LEFT COLUMN 2: Wider Blue Sidebar Panel (210px)
            (Can be collapsed on laptops to maximize screen width)
           ========================================================= */}
        <nav
          style={{
            width: 210,
            backgroundColor: 'var(--theme-sidebar-panel)',
            display: sidebarCollapsed ? 'none' : 'flex',
            flexDirection: 'column',
            padding: '28px 0 24px 20px',
            flexShrink: 0,
            transition: 'all 0.2s ease',
          }}
          className="hide-on-mobile"
        >
          {/* Logo Title + Collapse Button */}
          <div style={{ marginBottom: 32, paddingRight: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 3,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                  flexShrink: 0,
                  overflow: 'hidden',
                }}
              >
                <img
                  src="/logo.png"
                  alt="MathTest Logo"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </div>
              <div>
                <h2 style={{ color: '#ffffff', margin: 0, fontSize: '1.3rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                  MathTest
                </h2>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem', fontWeight: 500 }}>
                  Teacher Workspace
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSidebarCollapsed(true)}
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Collapse sidebar"
            >
              <ChevronLeft size={16} />
            </button>
          </div>

          {/* Navigation Items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
            <button
              type="button"
              className={activeSection === 'dashboard' ? 'sidebar-tab-active' : ''}
              onClick={() => scrollToSection('dashboard-top', 'dashboard')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '13px 18px',
                border: 'none',
                background: activeSection === 'dashboard' ? 'var(--theme-page-bg)' : 'transparent',
                color: activeSection === 'dashboard' ? 'var(--theme-primary)' : 'rgba(255, 255, 255, 0.85)',
                borderRadius: activeSection === 'dashboard' ? '18px 0 0 18px' : '16px 0 0 16px',
                cursor: 'pointer',
                fontSize: '0.94rem',
                fontWeight: activeSection === 'dashboard' ? 700 : 600,
                textAlign: 'left',
              }}
            >
              <LayoutDashboard size={18} />
              <span>Dashboard</span>
            </button>

            <button
              type="button"
              className={activeSection === 'exercises' ? 'sidebar-tab-active' : ''}
              onClick={() => scrollToSection('my-exercises-section', 'exercises')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '13px 18px',
                border: 'none',
                background: activeSection === 'exercises' ? 'var(--theme-page-bg)' : 'transparent',
                color: activeSection === 'exercises' ? 'var(--theme-primary)' : 'rgba(255, 255, 255, 0.85)',
                borderRadius: activeSection === 'exercises' ? '18px 0 0 18px' : '16px 0 0 16px',
                cursor: 'pointer',
                fontSize: '0.94rem',
                fontWeight: activeSection === 'exercises' ? 700 : 600,
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
            >
              <BookOpen size={18} />
              <span>Exercises</span>
            </button>

            <Link
              href="/admin/students"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '13px 18px',
                border: 'none',
                background: 'transparent',
                color: 'rgba(255, 255, 255, 0.85)',
                borderRadius: '16px 0 0 16px',
                cursor: 'pointer',
                fontSize: '0.94rem',
                fontWeight: 600,
                textAlign: 'left',
                textDecoration: 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <Users size={18} />
              <span>Students & Access</span>
            </Link>
          </div>

          {/* Sidebar bottom: Log out */}
          <div style={{ marginTop: 'auto', paddingRight: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              type="button"
              onClick={() => signOut(getAuthClient())}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderRadius: 12,
                backgroundColor: 'transparent',
                color: 'rgba(255, 255, 255, 0.75)',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.88rem',
                fontWeight: 600,
              }}
            >
              <LogOut size={16} />
              <span>Log Out</span>
            </button>
          </div>
        </nav>

        {/* =========================================================
            CONTENT AREA: Top Bar + 12-Column Grid
           ========================================================= */}
        <main
          style={{
            flex: 1,
            backgroundColor: 'var(--theme-page-bg)',
            overflowY: 'auto',
            padding: '24px 28px 48px',
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
            minWidth: 0,
          }}
          className="dashboard-main-content custom-scrollbar"
        >
          {/* =======================================================
              MOBILE TOP APP BAR (Visible on screens <= 1024px)
             ======================================================= */}
          <div
            className="show-on-mobile-only"
            style={{
              padding: '10px 14px',
              backgroundColor: 'var(--theme-card-bg)',
              borderRadius: 16,
              border: '1px solid var(--theme-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
            }}
          >
            {/* Left: Hamburger Button + Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: 'var(--theme-page-bg)',
                  border: '1px solid var(--theme-border)',
                  color: 'var(--theme-navy)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
                aria-label="Open navigation menu"
              >
                <Menu size={20} />
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <img
                  src="/logo.png"
                  alt="MathTest Logo"
                  style={{ height: 32, width: 'auto', objectFit: 'contain' }}
                />
                <span style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--theme-navy)' }}>
                  MathTest
                </span>
              </div>
            </div>

            {/* Right: Search Toggle, Notifications, Create */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Search Toggle */}
              <button
                type="button"
                onClick={() => setMobileSearchOpen((p) => !p)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: mobileSearchOpen ? 'var(--theme-primary)' : 'var(--theme-page-bg)',
                  color: mobileSearchOpen ? '#ffffff' : 'var(--theme-navy)',
                  border: '1px solid var(--theme-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
                aria-label="Search exercises"
              >
                <Search size={16} />
              </button>

              {/* Theme toggle on mobile */}
              <button
                type="button"
                onClick={toggleTheme}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: 'var(--theme-page-bg)',
                  border: '1px solid var(--theme-border)',
                  color: 'var(--theme-navy)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                aria-label="Toggle theme"
              >
                {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
              </button>

              {/* Notification bell on mobile */}
              <div className="notif-container" style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setShowNotifications((p) => !p)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: 'var(--theme-page-bg)',
                    border: '1px solid var(--theme-border)',
                    color: 'var(--theme-navy)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                  }}
                  aria-label="Notifications"
                >
                  <Bell size={16} />
                  {submissionsToday.length > 0 && (
                    <span
                      style={{
                        position: 'absolute',
                        top: 6,
                        right: 6,
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        backgroundColor: 'var(--theme-danger)',
                      }}
                    />
                  )}
                </button>
              </div>

              {/* Create Exercise CTA button */}
              <Link
                href="/admin/exercises/new"
                className="btn small"
                style={{
                  backgroundColor: 'var(--theme-primary)',
                  borderColor: 'var(--theme-primary)',
                  borderRadius: 10,
                  padding: '7px 12px',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  boxShadow: '0 2px 8px rgba(74, 103, 214, 0.25)',
                }}
              >
                <Plus size={15} />
                <span>{lang === 'KH' ? 'ថ្មី' : 'New'}</span>
              </Link>
            </div>
          </div>

          {/* Expandable Mobile Search Input */}
          {mobileSearchOpen && (
            <div className="show-on-mobile-only" style={{ width: '100%' }}>
              <div style={{ position: 'relative', width: '100%' }}>
                <Search
                  size={16}
                  style={{
                    position: 'absolute',
                    left: 14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--theme-muted)',
                  }}
                />
                <input
                  type="text"
                  autoFocus
                  placeholder={lang === 'KH' ? 'ស្វែងរកលំហាត់...' : 'Search exercises by title...'}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px 10px 40px',
                    backgroundColor: 'var(--theme-card-bg)',
                    borderColor: 'var(--theme-border)',
                    borderRadius: 12,
                    fontSize: '0.9rem',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  }}
                />
              </div>
            </div>
          )}

          {/* =======================================================
              DESKTOP / LAPTOP TOP BAR (Visible on screens > 1024px)
             ======================================================= */}
          <header
            className="show-on-desktop-only"
            style={{
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            {/* Search Box */}
            <div
              style={{
                position: 'relative',
                flex: 1,
                maxWidth: 420,
                minWidth: 220,
              }}
            >
              <Search
                size={18}
                style={{
                  position: 'absolute',
                  left: 14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--theme-muted)',
                }}
              />
              <input
                type="text"
                placeholder={lang === 'KH' ? 'ស្វែងរកលំហាត់តាមចំណងជើង...' : 'Search exercises by title...'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  padding: '10px 14px 10px 42px',
                  backgroundColor: 'var(--theme-card-bg)',
                  borderColor: 'transparent',
                  borderRadius: 14,
                  boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                  fontSize: '0.9rem',
                }}
              />
            </div>

            {/* Right Top Bar Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Students Roster Link */}
              <Link
                href="/admin/students"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: 'var(--theme-card-bg)',
                  border: '1px solid var(--theme-border)',
                  color: 'var(--theme-navy)',
                  borderRadius: 12,
                  padding: '7px 14px',
                  fontWeight: 700,
                  fontSize: '0.84rem',
                  textDecoration: 'none',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                }}
              >
                <Users size={16} />
                <span>Students</span>
                <span
                  style={{
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    color: '#2563eb',
                    padding: '1px 6px',
                    borderRadius: 999,
                    fontSize: '0.74rem',
                  }}
                >
                  {rosterStudents.length}
                </span>
              </Link>

              {/* Language Switcher */}
              <button
                type="button"
                onClick={() => setLang((prev) => (prev === 'EN' ? 'KH' : 'EN'))}
                style={{
                  backgroundColor: 'var(--theme-card-bg)',
                  border: '1px solid var(--theme-border)',
                  color: 'var(--theme-navy)',
                  borderRadius: 12,
                  padding: '7px 12px',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                }}
              >
                {lang === 'EN' ? '🇬🇧 EN' : '🇰🇭 KH'}
              </button>

              {/* Theme Toggle Button */}
              <button
                type="button"
                onClick={toggleTheme}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  backgroundColor: 'var(--theme-card-bg)',
                  border: '1px solid var(--theme-border)',
                  color: 'var(--theme-navy)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                }}
                aria-label="Toggle theme"
              >
                {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
              </button>

              {/* Notification Bell */}
              <div className="notif-container" style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setShowNotifications((p) => !p)}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    backgroundColor: 'var(--theme-card-bg)',
                    border: '1px solid var(--theme-border)',
                    color: 'var(--theme-navy)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                  }}
                  aria-label="Notifications"
                >
                  <Bell size={18} />
                  {submissionsToday.length > 0 && (
                    <span
                      style={{
                        position: 'absolute',
                        top: 7,
                        right: 7,
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: 'var(--theme-danger)',
                      }}
                    />
                  )}
                </button>

                {showNotifications && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 48,
                      width: 290,
                      backgroundColor: 'var(--theme-card-bg)',
                      borderRadius: 16,
                      boxShadow: 'var(--theme-shadow-hover)',
                      border: '1px solid var(--theme-border)',
                      padding: 16,
                      zIndex: 100,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                      <strong style={{ fontSize: '0.9rem' }}>Notifications</strong>
                      <span style={{ fontSize: '0.78rem', color: 'var(--theme-muted)' }}>
                        {submissionsToday.length} today
                      </span>
                    </div>
                    {submissionsToday.length === 0 ? (
                      <div style={{ fontSize: '0.84rem', color: 'var(--theme-muted)', textAlign: 'center', padding: '12px 0' }}>
                        No new notifications today.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {submissionsToday.slice(0, 4).map((s) => (
                          <div
                            key={s.id}
                            style={{
                              padding: '8px 10px',
                              backgroundColor: 'var(--theme-page-bg)',
                              borderRadius: 10,
                              fontSize: '0.82rem',
                            }}
                          >
                            <strong>{s.studentName}</strong> submitted an exercise ({s.score}/{s.total})
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Create Exercise Primary CTA */}
              <Link
                href="/admin/exercises/new"
                className="btn"
                style={{
                  backgroundColor: 'var(--theme-primary)',
                  borderColor: 'var(--theme-primary)',
                  borderRadius: 12,
                  padding: '9px 16px',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 4px 14px rgba(74, 103, 214, 0.3)',
                }}
              >
                <Plus size={16} />
                <span>{lang === 'KH' ? 'បង្កើតលំហាត់ថ្មី' : 'Create Exercise'}</span>
              </Link>

              {/* Teacher Profile Avatar & Email */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '4px 8px 4px 4px',
                  backgroundColor: 'var(--theme-card-bg)',
                  borderRadius: 14,
                  border: '1px solid var(--theme-border)',
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, #4a67d6 0%, #3d56a6 100%)',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {teacherName.charAt(0)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', paddingRight: 4 }}>
                  <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--theme-navy)', lineHeight: 1.2 }}>
                    {teacherName}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--theme-muted)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.email}
                  </span>
                </div>
              </div>
            </div>
          </header>

          {dataError && (
            <div
              style={{
                backgroundColor: 'var(--bad-bg)',
                color: 'var(--bad)',
                padding: '12px 16px',
                borderRadius: 14,
                border: '1px solid #fed7d7',
                fontSize: '0.9rem',
              }}
            >
              {dataError}
            </div>
          )}

          {/* =========================================================
              MAIN 12-COLUMN GRID (Center 8 cols, Right 4 cols)
             ========================================================= */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(12, 1fr)',
              gap: 24,
            }}
          >
            {/* -------------------------------------------------------
                CENTER COLUMN (Span 8 cols)
               ------------------------------------------------------- */}
            <div
              style={{
                gridColumn: 'span 8',
                display: 'flex',
                flexDirection: 'column',
                gap: 24,
                minWidth: 0,
              }}
              className="center-column-span"
            >
              {/* 1. Greeting Card with Flat Math Illustration */}
              <div
                id="dashboard-top"
                style={{
                  backgroundColor: 'var(--theme-card-bg)',
                  borderRadius: 20,
                  padding: '24px 28px',
                  boxShadow: 'var(--theme-shadow)',
                  border: '1px solid var(--theme-border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 20,
                  overflow: 'hidden',
                  position: 'relative',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ maxWidth: 440, zIndex: 1 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      backgroundColor: 'rgba(74, 103, 214, 0.1)',
                      color: 'var(--theme-primary)',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: 999,
                      marginBottom: 8,
                    }}
                  >
                    👋 {lang === 'KH' ? 'សួស្តីគ្រូបង្រៀន' : 'Teacher Dashboard'}
                  </span>
                  <h1
                    style={{
                      fontSize: '1.7rem',
                      fontWeight: 800,
                      color: 'var(--theme-navy)',
                      margin: '0 0 8px 0',
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {lang === 'KH' ? `សួស្តី, ${teacherName}!` : `Hello, ${teacherName}!`}
                  </h1>
                  <p style={{ margin: '0 0 16px', color: 'var(--theme-muted)', fontSize: '0.93rem' }}>
                    {submissionsToday.length > 0
                      ? lang === 'KH'
                        ? `អ្នកមានការបញ្ជូនចម្លើយថ្មីចំនួន ${submissionsToday.length} ថ្ងៃនេះ។ តោះពិនិត្យមើលវា។`
                        : `You have ${submissionsToday.length} new submissions today. Let's review them.`
                      : lang === 'KH'
                      ? 'លំហាត់គណិតវិទ្យារបស់អ្នកកំពុងដំណើរការយ៉ាងរលូន។'
                      : 'Your math exercises are active and ready for your students.'}
                  </p>
                  {exercises && exercises.length > 0 && (
                    <Link
                      href={`/admin/exercises/${exercises[0].id}/results`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        color: 'var(--theme-primary)',
                        fontWeight: 700,
                        fontSize: '0.88rem',
                        textDecoration: 'none',
                      }}
                    >
                      <span>{lang === 'KH' ? 'ពិនិត្យលទ្ធផល →' : 'Review latest results →'}</span>
                    </Link>
                  )}
                </div>

                {/* Flat Math Illustration (Pure Inline SVG) */}
                <div className="greeting-illustration" style={{ width: 140, height: 115, flexShrink: 0 }}>
                  <svg viewBox="0 0 180 140" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
                    <circle cx="90" cy="70" r="58" fill="#4a67d6" fillOpacity="0.08" />
                    <rect x="35" y="45" width="80" height="52" rx="8" fill="#4a67d6" />
                    <rect x="42" y="52" width="66" height="38" rx="4" fill="#ffffff" />
                    <path d="M52 64L60 76L76 60" stroke="#1faa6b" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="120" cy="40" r="14" fill="#e0a000" fillOpacity="0.2" />
                    <text x="115" y="45" fill="#e0a000" fontSize="14" fontWeight="bold">∑</text>
                    <rect x="95" y="80" width="50" height="32" rx="6" fill="#3d56a6" />
                    <text x="108" y="101" fill="#ffffff" fontSize="13" fontWeight="bold">π r²</text>
                    <path d="M135 25L138 32L145 35L138 38L135 45L132 38L125 35L132 32Z" fill="#e0a000" />
                    <line x1="28" y1="108" x2="68" y2="108" stroke="#4a67d6" strokeWidth="6" strokeLinecap="round" />
                    <circle cx="34" cy="108" r="1.5" fill="#ffffff" />
                    <circle cx="44" cy="108" r="1.5" fill="#ffffff" />
                    <circle cx="54" cy="108" r="1.5" fill="#ffffff" />
                    <circle cx="64" cy="108" r="1.5" fill="#ffffff" />
                  </svg>
                </div>
              </div>

              {/* Stat Cards (Row of 4 Cards) */}
              <div
                className="stat-cards-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: 16,
                }}
              >
                <div
                  style={{
                    backgroundColor: 'var(--theme-card-bg)',
                    borderRadius: 16,
                    padding: '16px 18px',
                    boxShadow: 'var(--theme-shadow)',
                    border: '1px solid var(--theme-border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <span style={{ fontSize: '0.76rem', color: 'var(--theme-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                    Total Exercises
                  </span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--theme-primary)' }}>
                      {exercises?.length ?? 0}
                    </span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--theme-muted)' }}>tests</span>
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: 'var(--theme-card-bg)',
                    borderRadius: 16,
                    padding: '16px 18px',
                    boxShadow: 'var(--theme-shadow)',
                    border: '1px solid var(--theme-border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <span style={{ fontSize: '0.76rem', color: 'var(--theme-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                    Published (Live)
                  </span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--theme-success)' }}>
                      {exercises?.filter((e) => e.published).length ?? 0}
                    </span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--theme-muted)' }}>active</span>
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: 'var(--theme-card-bg)',
                    borderRadius: 16,
                    padding: '16px 18px',
                    boxShadow: 'var(--theme-shadow)',
                    border: '1px solid var(--theme-border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <span style={{ fontSize: '0.76rem', color: 'var(--theme-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                    Drafts
                  </span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--theme-warning)' }}>
                      {(exercises?.length ?? 0) - (exercises?.filter((e) => e.published).length ?? 0)}
                    </span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--theme-muted)' }}>editing</span>
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: 'var(--theme-card-bg)',
                    borderRadius: 16,
                    padding: '16px 18px',
                    boxShadow: 'var(--theme-shadow)',
                    border: '1px solid var(--theme-border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <span style={{ fontSize: '0.76rem', color: 'var(--theme-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                    Submissions Today
                  </span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--theme-navy)' }}>
                      {submissionsToday.length}
                    </span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--theme-muted)' }}>students</span>
                  </div>
                </div>
              </div>

              {/* Parent Tracking & Settings Banner */}
              <div
                style={{
                  backgroundColor: 'var(--theme-card-bg)',
                  borderRadius: 18,
                  padding: '16px 22px',
                  boxShadow: 'var(--theme-shadow)',
                  border: '1px solid var(--theme-border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 14,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 12,
                      backgroundColor: 'rgba(59, 130, 246, 0.12)',
                      color: '#2563eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: 'var(--theme-navy)' }}>
                        Parent Tracking & Roster
                      </h4>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 999,
                          backgroundColor: 'var(--theme-page-bg)',
                          color: 'var(--theme-muted)',
                          border: '1px solid var(--theme-border)',
                        }}
                      >
                        {rosterStudents.length} Students in Roster
                      </span>
                    </div>
                    <p style={{ margin: '2px 0 0 0', fontSize: '0.82rem', color: 'var(--theme-muted)' }}>
                      Parents can follow their child&apos;s results with a single private link or QR code.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <Link
                    href="/admin/students"
                    className="btn secondary small"
                    style={{
                      borderRadius: 12,
                      fontSize: '0.84rem',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Users size={15} />
                    <span>Manage Students</span>
                  </Link>

                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 10,
                      cursor: 'pointer',
                      fontSize: '0.84rem',
                      fontWeight: 600,
                      color: 'var(--theme-navy)',
                      padding: '7px 12px',
                      borderRadius: 12,
                      backgroundColor: 'var(--theme-page-bg)',
                      border: '1px solid var(--theme-border)',
                      userSelect: 'none',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={showClassAverage}
                      onChange={(e) => handleToggleClassAverage(e.target.checked)}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--theme-primary)' }}
                    />
                    <span>Show class average to parents</span>
                  </label>
                </div>
              </div>

              {/* 4. My Exercises List (Replaces Linked Teachers) */}
              <div
                id="my-exercises-section"
                style={{
                  backgroundColor: 'var(--theme-card-bg)',
                  borderRadius: 20,
                  padding: '24px 28px',
                  boxShadow: 'var(--theme-shadow)',
                  border: '1px solid var(--theme-border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                }}
              >
                {/* 6 Permanent Grade Folders */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Folder size={22} color="var(--theme-primary)" />
                      <div>
                        <h4 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--theme-navy)' }}>
                          {lang === 'KH' ? 'ថតលំហាត់តាមកម្រិតថ្នាក់ (Grade Folder Library)' : 'Grade Folder Exercise Library'}
                        </h4>
                        <span style={{ fontSize: '0.8rem', color: 'var(--theme-muted)' }}>
                          {lang === 'KH' ? 'ជ្រើសរើសថតកម្រិតថ្នាក់ដើម្បីមើល ចាត់ចែង ឬបង្កើតលំហាត់' : 'Select a grade folder to view, manage, or create exercises'}
                        </span>
                      </div>
                    </div>
                    {gradeFilter !== 'all' && (
                      <button
                        type="button"
                        onClick={() => {
                          setGradeFilter('all');
                          setSelectedChapter('all');
                        }}
                        className="btn small secondary"
                        style={{ fontSize: '0.82rem', borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        ← {lang === 'KH' ? 'មើលគ្រប់ថតទាំងអស់' : 'View All Folders'}
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                    {GRADE_FOLDERS.map((gf) => {
                      const isOpen = gradeFilter === String(gf.grade);
                      const gradeExs = (exercises || []).filter(
                        (e) => !e.gradeLevels || e.gradeLevels.length === 0 || e.gradeLevels.includes(gf.grade)
                      );
                      const totalCount = gradeExs.length;
                      const pubCount = gradeExs.filter(
                        (e) => e.published && e.publicationMode !== 'draft' && (!e.scheduledPublishAt || new Date(e.scheduledPublishAt).getTime() <= Date.now())
                      ).length;
                      const draftCount = gradeExs.filter((e) => !e.published || e.publicationMode === 'draft').length;

                      return (
                        <div
                          key={gf.grade}
                          onClick={() => {
                            if (isOpen) {
                              setGradeFilter('all');
                              setSelectedChapter('all');
                            } else {
                              setGradeFilter(String(gf.grade));
                              setSelectedChapter('all');
                            }
                          }}
                          style={{
                            padding: '14px 14px',
                            borderRadius: 14,
                            backgroundColor: isOpen ? gf.bg : 'var(--theme-page-bg)',
                            border: isOpen ? `2px solid ${gf.color}` : '1.5px solid var(--theme-border)',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                            boxShadow: isOpen ? `0 4px 14px ${gf.color}25` : 'none',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {isOpen ? (
                                <FolderOpen size={24} color={gf.color} />
                              ) : (
                                <Folder size={24} color={gf.color} />
                              )}
                              <span style={{ fontWeight: 800, fontSize: '0.98rem', color: 'var(--theme-navy)' }}>
                                {lang === 'KH' ? gf.labelKh : gf.labelEn}
                              </span>
                            </div>
                            {isOpen && (
                              <span style={{ fontSize: '0.7rem', fontWeight: 800, color: gf.color, backgroundColor: 'rgba(255,255,255,0.85)', padding: '2px 6px', borderRadius: 6 }}>
                                កំពុងបើក
                              </span>
                            )}
                          </div>

                          <div style={{ fontSize: '0.78rem', color: 'var(--theme-muted)', display: 'flex', justifyContent: 'space-between' }}>
                            <span>{totalCount} {lang === 'KH' ? 'លំហាត់' : 'tests'}</span>
                            <span>{pubCount} ផ្សាយ · {draftCount} ព្រាង</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Active Folder Breadcrumb Bar */}
                {gradeFilter !== 'all' && (
                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: 14,
                      backgroundColor: 'rgba(59, 130, 246, 0.08)',
                      border: '1px solid rgba(59, 130, 246, 0.25)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.92rem', fontWeight: 700, color: 'var(--theme-navy)' }}>
                      <span>📁 {lang === 'KH' ? 'បណ្ណាល័យលំហាត់' : 'Exercise Library'}</span>
                      <ChevronRight size={16} color="var(--theme-muted)" />
                      <span style={{ color: 'var(--theme-primary)' }}>
                        📂 ថ្នាក់ទី {gradeFilter} (Grade {gradeFilter})
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {availableChapters.length > 0 && (
                        <select
                          value={selectedChapter}
                          onChange={(e) => setSelectedChapter(e.target.value)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 10,
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            backgroundColor: 'var(--theme-card-bg)',
                            color: 'var(--theme-navy)',
                            border: '1px solid var(--theme-border)',
                            cursor: 'pointer',
                          }}
                        >
                          <option value="all">គ្រប់ជំពូក (All Chapters)</option>
                          {availableChapters.map((ch) => (
                            <option key={ch} value={ch}>📚 {ch}</option>
                          ))}
                        </select>
                      )}

                      <Link
                        href={`/admin/exercises/new?grade=${gradeFilter}`}
                        className="btn small"
                        style={{
                          backgroundColor: 'var(--theme-primary)',
                          color: '#fff',
                          borderRadius: 10,
                          fontSize: '0.84rem',
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          textDecoration: 'none',
                          boxShadow: '0 2px 8px rgba(37,99,235,0.25)',
                        }}
                      >
                        <Plus size={16} />
                        <span>+ {lang === 'KH' ? `បង្កើតលំហាត់ថ្នាក់ទី ${gradeFilter}` : `New Grade ${gradeFilter} Exercise`}</span>
                      </Link>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--theme-navy)' }}>
                      {gradeFilter === 'all'
                        ? (lang === 'KH' ? 'លំហាត់ទាំងអស់ (All Exercises)' : 'My Exercises')
                        : (lang === 'KH' ? `លំហាត់ថ្នាក់ទី ${gradeFilter}` : `Grade ${gradeFilter} Exercises`)}
                    </h3>
                    <span style={{ fontSize: '0.82rem', color: 'var(--theme-muted)' }}>
                      Manage tests, view live submissions, copy links, or print QR codes
                    </span>
                  </div>

                  {/* Filter Controls: Grade dropdown + Status Pills */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select
                      value={gradeFilter}
                      onChange={(e) => {
                        setGradeFilter(e.target.value);
                        setSelectedChapter('all');
                      }}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 10,
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        backgroundColor: 'var(--theme-page-bg)',
                        color: 'var(--theme-navy)',
                        border: '1px solid var(--theme-border)',
                        cursor: 'pointer',
                      }}
                      aria-label="Filter exercises by grade"
                    >
                      <option value="all">គ្រប់កម្រិតថ្នាក់ (All Grades 7–12)</option>
                      <option value="7">ថ្នាក់ទី ៧ (Grade 7)</option>
                      <option value="8">ថ្នាក់ទី ៨ (Grade 8)</option>
                      <option value="9">ថ្នាក់ទី ៩ (Grade 9)</option>
                      <option value="10">ថ្នាក់ទី ១០ (Grade 10)</option>
                      <option value="11">ថ្នាក់ទី ១១ (Grade 11)</option>
                      <option value="12">ថ្នាក់ទី ១២ (Grade 12)</option>
                    </select>

                    <button
                      type="button"
                      className={`btn small ${filter === 'all' ? '' : 'secondary'}`}
                      onClick={() => setFilter('all')}
                      style={{ borderRadius: 10, fontSize: '0.8rem' }}
                    >
                      All ({exercises?.length ?? 0})
                    </button>
                    <button
                      type="button"
                      className={`btn small ${filter === 'published' ? '' : 'secondary'}`}
                      onClick={() => setFilter('published')}
                      style={{ borderRadius: 10, fontSize: '0.8rem' }}
                    >
                      Published ({exercises?.filter((e) => e.published && e.publicationMode !== 'draft' && (!e.scheduledPublishAt || new Date(e.scheduledPublishAt).getTime() <= Date.now())).length ?? 0})
                    </button>
                    <button
                      type="button"
                      className={`btn small ${filter === 'scheduled' ? '' : 'secondary'}`}
                      onClick={() => setFilter('scheduled')}
                      style={{ borderRadius: 10, fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <span>⏰ Scheduled ({exercises?.filter((e) => e.publicationMode === 'scheduled' || (e.scheduledPublishAt && new Date(e.scheduledPublishAt).getTime() > Date.now())).length ?? 0})</span>
                    </button>
                    <button
                      type="button"
                      className={`btn small ${filter === 'draft' ? '' : 'secondary'}`}
                      onClick={() => setFilter('draft')}
                      style={{ borderRadius: 10, fontSize: '0.8rem' }}
                    >
                      Drafts ({exercises?.filter((e) => !e.published || e.publicationMode === 'draft').length ?? 0})
                    </button>
                  </div>
                </div>

                {/* Exercises Rows */}
                {loadingData ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {[1, 2, 3].map((n) => (
                      <div key={n} style={{ height: 64, borderRadius: 12 }} className="skeleton" />
                    ))}
                  </div>
                ) : filteredExercises.length === 0 ? (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '36px 16px',
                      backgroundColor: 'var(--theme-page-bg)',
                      borderRadius: 16,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <BookOpen size={36} color="var(--theme-muted)" />
                    <p style={{ margin: 0, color: 'var(--theme-muted)', fontSize: '0.92rem' }}>
                      {search ? 'No exercises match your search query.' : 'No exercises created yet.'}
                    </p>
                    <Link
                      href="/admin/exercises/new"
                      className="btn"
                      style={{
                        backgroundColor: 'var(--theme-primary)',
                        borderColor: 'var(--theme-primary)',
                        borderRadius: 12,
                        padding: '8px 16px',
                        fontSize: '0.88rem',
                      }}
                    >
                      Create your first exercise
                    </Link>
                  </div>
                ) : (
                  (() => {
                    // Group exercises by Chapter for the active view
                    const groups: { [key: string]: Row[] } = {};
                    filteredExercises.forEach((r) => {
                      const ch = (r.chapter && r.chapter.trim()) ? r.chapter.trim() : (lang === 'KH' ? 'លំហាត់ទូទៅ (គ្មានជំពូក)' : 'General Exercises (No Chapter)');
                      if (!groups[ch]) groups[ch] = [];
                      groups[ch].push(r);
                    });

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {Object.entries(groups).map(([chTitle, chExercises]) => {
                          const isGeneral = chTitle === 'លំហាត់ទូទៅ (គ្មានជំពូក)' || chTitle === 'General Exercises (No Chapter)';
                          const isCollapsed = collapsedAdminChapters[chTitle] ?? false;

                          return (
                            <div
                              key={chTitle}
                              style={{
                                backgroundColor: 'var(--theme-card-bg)',
                                borderRadius: 16,
                                border: '1.5px solid var(--theme-border)',
                                overflow: 'visible',
                                boxShadow: 'var(--theme-shadow)',
                              }}
                            >
                              {/* Chapter Accordion Header */}
                              <div
                                onClick={() => toggleAdminChapter(chTitle)}
                                style={{
                                  padding: '12px 18px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  cursor: 'pointer',
                                  borderRadius: isCollapsed ? 15 : '15px 15px 0 0',
                                  backgroundColor: isCollapsed ? 'transparent' : 'rgba(59, 130, 246, 0.05)',
                                  borderBottom: isCollapsed ? 'none' : '1px solid var(--theme-border)',
                                  userSelect: 'none',
                                  transition: 'background-color 0.15s ease',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <div
                                    style={{
                                      width: 32,
                                      height: 32,
                                      borderRadius: 8,
                                      backgroundColor: isGeneral ? 'rgba(156, 163, 175, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                                      color: isGeneral ? 'var(--theme-muted)' : 'var(--theme-primary)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: '0.95rem',
                                    }}
                                  >
                                    {isGeneral ? '📂' : '📚'}
                                  </div>
                                  <div>
                                    <div style={{ fontWeight: 800, fontSize: '0.98rem', color: 'var(--theme-navy)' }}>
                                      {chTitle}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--theme-muted)', marginTop: 1 }}>
                                      {chExercises.length} {lang === 'KH' ? 'លំហាត់' : 'exercises'}
                                    </div>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--theme-muted)', fontSize: '0.8rem', fontWeight: 600 }}>
                                  <span>{isCollapsed ? (lang === 'KH' ? 'ពង្រីក' : 'Expand') : (lang === 'KH' ? 'បង្រួម' : 'Collapse')}</span>
                                  {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                                </div>
                              </div>

                              {/* Chapter Exercises Container */}
                              {!isCollapsed && (
                                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                  {chExercises.map((r, rIdx) => {
                      const stats = exStats.get(r.id);
                      const subCount = stats?.count ?? 0;
                      const isMenuOpen = activeMenuId === r.id;
                      const isNearBottom = rIdx >= chExercises.length - 1 && chExercises.length > 1;
                      const unsubmittedList = getUnsubmittedStudents(r.id);

                      return (
                        <div
                          key={r.id}
                          className="exercise-row-container"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '14px 18px',
                            backgroundColor: 'var(--theme-page-bg)',
                            borderRadius: 14,
                            gap: 14,
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {/* Title + Meta */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                              <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--theme-navy)' }}>
                                {r.title || 'Untitled'}
                              </h4>

                              {/* Grade Level Tag */}
                              <span
                                style={{
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  padding: '2px 8px',
                                  borderRadius: 999,
                                  backgroundColor: 'rgba(74, 103, 214, 0.12)',
                                  color: 'var(--brand)',
                                  border: '1px solid rgba(74, 103, 214, 0.25)',
                                }}
                              >
                                {r.gradeLevels && r.gradeLevels.length > 0 && r.gradeLevels.length < 6
                                  ? `ថ្នាក់ទី ${r.gradeLevels.join(', ')}`
                                  : 'ថ្នាក់ទី ៧–១២'}
                              </span>

                              {/* Chapter & Topic Badges */}
                              {r.chapter && (
                                <span
                                  style={{
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: 6,
                                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                    color: 'var(--theme-primary)',
                                    border: '1px solid rgba(59, 130, 246, 0.2)',
                                  }}
                                >
                                  📚 {r.chapter}
                                </span>
                              )}
                              {r.topic && (
                                <span
                                  style={{
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    padding: '2px 8px',
                                    borderRadius: 6,
                                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                    color: '#059669',
                                    border: '1px solid rgba(16, 185, 129, 0.2)',
                                  }}
                                >
                                  🔖 {r.topic}
                                </span>
                              )}

                              {/* Sample Free Trial Badge */}
                              {r.isSample && (
                                <span
                                  style={{
                                    fontSize: '0.72rem',
                                    fontWeight: 800,
                                    padding: '2px 8px',
                                    borderRadius: 6,
                                    backgroundColor: '#10b981',
                                    color: '#ffffff',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3,
                                  }}
                                >
                                  🌟 FREE SAMPLE
                                </span>
                              )}

                              {/* Publication Status Pill */}
                              {(() => {
                                const isScheduled = r.published && r.publicationMode === 'scheduled' && r.scheduledPublishAt && new Date(r.scheduledPublishAt).getTime() > Date.now();
                                if (isScheduled) {
                                  return (
                                    <span
                                      style={{
                                        fontSize: '0.72rem',
                                        fontWeight: 700,
                                        padding: '2px 8px',
                                        borderRadius: 999,
                                        backgroundColor: 'rgba(59, 130, 246, 0.15)',
                                        color: '#2563eb',
                                        border: '1px solid rgba(59, 130, 246, 0.3)',
                                      }}
                                    >
                                      ⏰ Scheduled
                                    </span>
                                  );
                                }
                                if (r.published) {
                                  return (
                                    <span
                                      style={{
                                        fontSize: '0.72rem',
                                        fontWeight: 700,
                                        padding: '2px 8px',
                                        borderRadius: 999,
                                        backgroundColor: 'var(--good-bg)',
                                        color: 'var(--theme-success)',
                                      }}
                                    >
                                      Published
                                    </span>
                                  );
                                }
                                return (
                                  <span
                                    style={{
                                      fontSize: '0.72rem',
                                      fontWeight: 700,
                                      padding: '2px 8px',
                                      borderRadius: 999,
                                      backgroundColor: 'var(--warn-bg)',
                                      color: 'var(--theme-warning)',
                                    }}
                                  >
                                    Draft
                                  </span>
                                );
                              })()}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: '0.8rem', color: 'var(--theme-muted)', flexWrap: 'wrap' }}>
                              <span>{r.questions?.length ?? 0} Qs</span>
                              <span>•</span>
                              <span>{r.timeLimitMinutes ? `${r.timeLimitMinutes}m limit` : 'No time limit'}</span>
                              {r.scheduledPublishAt && new Date(r.scheduledPublishAt).getTime() > Date.now() && (
                                <>
                                  <span>•</span>
                                  <span style={{ color: '#2563eb', fontWeight: 600 }}>
                                    📅 ផ្សាយ: {new Date(r.scheduledPublishAt).toLocaleDateString('km-KH', { timeZone: 'Asia/Phnom_Penh', month: 'short', day: 'numeric' })} {new Date(r.scheduledPublishAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Phnom_Penh' })}
                                  </span>
                                </>
                              )}
                              {r.deadline && (
                                <>
                                  <span>•</span>
                                  <span>
                                    ⌛ ផុតកំណត់: {new Date(r.deadline).toLocaleDateString('km-KH', { timeZone: 'Asia/Phnom_Penh', month: 'short', day: 'numeric' })}
                                  </span>
                                </>
                              )}
                              <span>•</span>
                              <span>{subCount} submissions</span>
                            </div>

                            {/* Submissions Mini Progress Bar */}
                            <div
                              style={{
                                width: 120,
                                height: 4,
                                backgroundColor: 'var(--theme-border)',
                                borderRadius: 999,
                                marginTop: 6,
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  width: `${Math.min(100, subCount * 10)}%`,
                                  height: '100%',
                                  backgroundColor: 'var(--theme-primary)',
                                }}
                              />
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="exercise-row-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                            {/* Unsubmitted Students Button (if roster exists) */}
                            {rosterStudents.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setUnsubmittedModalEx(r)}
                                style={{
                                  padding: '6px 11px',
                                  borderRadius: 10,
                                  backgroundColor: unsubmittedList.length > 0 ? 'rgba(239, 68, 68, 0.08)' : 'var(--good-bg)',
                                  color: unsubmittedList.length > 0 ? 'var(--theme-danger)' : 'var(--theme-success)',
                                  border: '1px solid currentColor',
                                  fontSize: '0.78rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  whiteSpace: 'nowrap',
                                }}
                                title="View roster students who haven't submitted"
                              >
                                <UserX size={13} />
                                <span>{unsubmittedList.length} Not Done</span>
                              </button>
                            )}

                            {/* QR Code Button */}
                            <button
                              type="button"
                              onClick={() => setQrModalEx(r)}
                              style={{
                                width: 34,
                                height: 34,
                                borderRadius: 10,
                                backgroundColor: 'var(--theme-card-bg)',
                                border: '1px solid var(--theme-border)',
                                color: 'var(--theme-navy)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                              title="Show QR Code"
                              aria-label="QR Code"
                            >
                              <QrCode size={16} />
                            </button>

                            {/* Results Primary Button */}
                            <Link
                              href={`/admin/exercises/${r.id}/results`}
                              className="btn small"
                              style={{
                                backgroundColor: 'var(--theme-primary)',
                                borderColor: 'var(--theme-primary)',
                                borderRadius: 10,
                                padding: '6px 12px',
                                fontSize: '0.82rem',
                                fontWeight: 700,
                              }}
                            >
                              Results
                            </Link>

                            {/* Direct Edit Button */}
                            <Link
                              href={`/admin/exercises/${r.id}`}
                              className="btn small secondary"
                              style={{
                                borderRadius: 10,
                                padding: '6px 10px',
                                fontSize: '0.82rem',
                                fontWeight: 600,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                textDecoration: 'none',
                              }}
                              title={lang === 'KH' ? 'កែសម្រួល' : 'Edit'}
                            >
                              <Edit3 size={14} />
                              <span>{lang === 'KH' ? 'កែ' : 'Edit'}</span>
                            </Link>

                            {/* More Actions Dropdown Menu */}
                            <div className="action-menu-container" style={{ position: 'relative' }}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMenuId(isMenuOpen ? null : r.id);
                                }}
                                style={{
                                  width: 34,
                                  height: 34,
                                  borderRadius: 10,
                                  backgroundColor: 'var(--theme-card-bg)',
                                  border: '1px solid var(--theme-border)',
                                  color: 'var(--theme-navy)',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                                aria-label="More actions"
                              >
                                <MoreVertical size={16} />
                              </button>

                              {isMenuOpen && (
                                <div
                                  style={{
                                    position: 'absolute',
                                    right: 0,
                                    ...(isNearBottom ? { bottom: 'calc(100% + 6px)' } : { top: 40 }),
                                    width: 185,
                                    backgroundColor: 'var(--theme-card-bg)',
                                    borderRadius: 14,
                                    boxShadow: '0 10px 30px rgba(0,0,0,0.18), var(--theme-shadow-hover)',
                                    border: '1.5px solid var(--theme-border)',
                                    padding: '6px 0',
                                    zIndex: 100,
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      copyStudentLink(r.id);
                                      setActiveMenuId(null);
                                    }}
                                    style={{
                                      width: '100%',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 10,
                                      padding: '8px 14px',
                                      border: 'none',
                                      background: 'none',
                                      color: 'var(--theme-navy)',
                                      fontSize: '0.84rem',
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                      textAlign: 'left',
                                    }}
                                  >
                                    <Copy size={14} />
                                    <span>Copy Link</span>
                                  </button>

                                  <Link
                                    href={`/admin/exercises/${r.id}`}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 10,
                                      padding: '8px 14px',
                                      color: 'var(--theme-navy)',
                                      fontSize: '0.84rem',
                                      fontWeight: 600,
                                      textDecoration: 'none',
                                    }}
                                  >
                                    <Edit3 size={14} />
                                    <span>Edit</span>
                                  </Link>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleDuplicateExercise(r);
                                      setActiveMenuId(null);
                                    }}
                                    style={{
                                      width: '100%',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 10,
                                      padding: '8px 14px',
                                      border: 'none',
                                      background: 'none',
                                      color: 'var(--theme-navy)',
                                      fontSize: '0.84rem',
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                      textAlign: 'left',
                                    }}
                                  >
                                    <CopyPlus size={14} />
                                    <span>Duplicate</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setMoveModalEx(r);
                                      setMoveGrades(r.gradeLevels && r.gradeLevels.length > 0 ? [...r.gradeLevels] : [7, 8, 9, 10, 11, 12]);
                                      setMoveChapter(r.chapter || '');
                                      setActiveMenuId(null);
                                    }}
                                    style={{
                                      width: '100%',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 10,
                                      padding: '8px 14px',
                                      border: 'none',
                                      background: 'none',
                                      color: 'var(--theme-navy)',
                                      fontSize: '0.84rem',
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                      textAlign: 'left',
                                    }}
                                  >
                                    <FolderSymlink size={14} color="var(--theme-primary)" />
                                    <span>{lang === 'KH' ? 'ប្តូរថ្នាក់ / ជំពូក (Move)' : 'Move to Chapter / Grade'}</span>
                                  </button>

                                  {rosterStudents.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setUnsubmittedModalEx(r);
                                        setActiveMenuId(null);
                                      }}
                                      style={{
                                        width: '100%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 10,
                                        padding: '8px 14px',
                                        border: 'none',
                                        background: 'none',
                                        color: 'var(--theme-navy)',
                                        fontSize: '0.84rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                      }}
                                    >
                                      <UserX size={14} />
                                      <span>Not submitted ({unsubmittedList.length})</span>
                                    </button>
                                  )}

                                  <div style={{ height: 1, backgroundColor: 'var(--theme-border)', margin: '4px 0' }} />

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDeleteConfirmEx(r);
                                      setActiveMenuId(null);
                                    }}
                                    style={{
                                      width: '100%',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 10,
                                      padding: '8px 14px',
                                      border: 'none',
                                      background: 'none',
                                      color: 'var(--theme-danger)',
                                      fontSize: '0.84rem',
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                      textAlign: 'left',
                                    }}
                                  >
                                    <Trash2 size={14} />
                                    <span>Delete</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                                  );
                                  })}
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
            </div>

            {/* -------------------------------------------------------
                RIGHT COLUMN (Span 4 cols)
               ------------------------------------------------------- */}
            <div
              style={{
                gridColumn: 'span 4',
                display: 'flex',
                flexDirection: 'column',
                gap: 24,
                minWidth: 0,
              }}
              className="right-column-span"
            >
              {/* 6. Right Column: "Upcoming Deadlines" Card */}
              <div
                style={{
                  backgroundColor: 'var(--theme-card-bg)',
                  borderRadius: 20,
                  padding: '24px 22px',
                  boxShadow: 'var(--theme-shadow)',
                  border: '1px solid var(--theme-border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Clock size={18} color="var(--theme-primary)" />
                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--theme-navy)' }}>
                      Upcoming Deadlines
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const el = document.getElementById('my-exercises-section');
                      el?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--theme-primary)',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    See all
                  </button>
                </div>

                {upcomingDeadlines.length === 0 ? (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '24px 12px',
                      color: 'var(--theme-muted)',
                      fontSize: '0.86rem',
                      backgroundColor: 'var(--theme-page-bg)',
                      borderRadius: 14,
                    }}
                  >
                    No upcoming deadlines set.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {upcomingDeadlines.map((e) => (
                      <div
                        key={e.id}
                        style={{
                          padding: '12px 14px',
                          borderRadius: 14,
                          backgroundColor: 'var(--theme-page-bg)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h4 style={{ margin: '0 0 2px', fontSize: '0.88rem', fontWeight: 700, color: 'var(--theme-navy)' }}>
                            {e.title || 'Untitled'}
                          </h4>
                          <span style={{ fontSize: '0.74rem', color: 'var(--theme-muted)' }}>
                            Due {new Date(e.deadline!).toLocaleDateString()}
                          </span>
                        </div>

                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: 8,
                            backgroundColor: e.isUrgent ? 'var(--bad-bg)' : 'rgba(74, 103, 214, 0.1)',
                            color: e.isUrgent ? 'var(--theme-danger)' : 'var(--theme-primary)',
                            flexShrink: 0,
                          }}
                        >
                          {e.countdownText}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 7. Teacher Quick Card (Colleagues / Invites) */}
              <div
                style={{
                  backgroundColor: 'var(--theme-card-bg)',
                  borderRadius: 20,
                  padding: '20px 22px',
                  boxShadow: 'var(--theme-shadow)',
                  border: '1px solid var(--theme-border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: 'var(--theme-navy)' }}>
                    Add another teacher?
                  </h4>
                  <span style={{ fontSize: '0.78rem', color: 'var(--theme-muted)' }}>
                    Create login credentials for fellow teachers
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddTeacherModal(true)}
                  className="btn small"
                  style={{
                    backgroundColor: 'var(--theme-primary)',
                    borderColor: 'var(--theme-primary)',
                    borderRadius: 10,
                    padding: '6px 12px',
                    fontSize: '0.82rem',
                    flexShrink: 0,
                  }}
                >
                  + Add
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* =========================================================
          MODAL 1: QR Code Modal
         ========================================================= */}
      {qrModalEx && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setQrModalEx(null);
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--theme-card-bg)',
              borderRadius: 24,
              padding: '28px 24px',
              maxWidth: 400,
              width: 'calc(100% - 24px)',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--theme-navy)' }}>
                Student Test QR Code
              </h3>
              <button
                type="button"
                onClick={() => setQrModalEx(null)}
                style={{
                  border: 'none',
                  background: 'none',
                  color: 'var(--theme-muted)',
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--theme-muted)' }}>
              Scan with phone or tablet to open <strong>{qrModalEx.title || 'Exercise'}</strong>
            </p>

            <div
              style={{
                padding: 16,
                backgroundColor: '#ffffff',
                borderRadius: 16,
                boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
                border: '1px solid #e2e8f0',
                maxWidth: '100%',
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <QRCodeSVG
                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/e/${qrModalEx.id}`}
                size={180}
                level="M"
              />
            </div>

            <div style={{ width: '100%', display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="btn grow"
                onClick={() => {
                  copyStudentLink(qrModalEx.id);
                  setQrModalEx(null);
                }}
                style={{
                  backgroundColor: 'var(--theme-primary)',
                  borderColor: 'var(--theme-primary)',
                  borderRadius: 12,
                  fontSize: '0.88rem',
                }}
              >
                Copy Link
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setQrModalEx(null)}
                style={{ borderRadius: 12, fontSize: '0.88rem' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 2: Delete Confirmation Modal
         ========================================================= */}
      {deleteConfirmEx && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteConfirmEx(null);
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--theme-card-bg)',
              borderRadius: 24,
              padding: '28px 24px',
              maxWidth: 420,
              width: 'calc(100% - 24px)',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                backgroundColor: 'var(--bad-bg)',
                color: 'var(--theme-danger)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Trash2 size={24} />
            </div>

            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--theme-navy)' }}>
              Delete Exercise?
            </h3>

            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--theme-muted)' }}>
              Are you sure you want to delete <strong>{deleteConfirmEx.title || 'this exercise'}</strong>? Existing student submissions will remain safely in the database.
            </p>

            <div style={{ width: '100%', display: 'flex', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                className="btn secondary grow"
                onClick={() => setDeleteConfirmEx(null)}
                style={{ borderRadius: 12 }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn danger grow"
                onClick={() => handleDeleteExercise(deleteConfirmEx.id)}
                style={{
                  backgroundColor: 'var(--theme-danger)',
                  borderColor: 'var(--theme-danger)',
                  color: '#ffffff',
                  borderRadius: 12,
                }}
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 3: Register Another Teacher Modal
         ========================================================= */}
      {showAddTeacherModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddTeacherModal(false);
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--theme-card-bg)',
              borderRadius: 24,
              padding: '28px 24px',
              maxWidth: 460,
              width: 'calc(100% - 24px)',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--theme-navy)' }}>
                Register Another Teacher
              </h3>
              <button
                type="button"
                onClick={() => setShowAddTeacherModal(false)}
                style={{
                  border: 'none',
                  background: 'none',
                  color: 'var(--theme-muted)',
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--theme-muted)' }}>
              Create a login account for a fellow teacher. They can sign in immediately at <strong>/admin</strong> to manage exercises and see student submissions.
            </p>

            {addTeacherSuccess && (
              <div
                style={{
                  backgroundColor: 'var(--good-bg)',
                  color: 'var(--theme-success)',
                  padding: '10px 14px',
                  borderRadius: 12,
                  fontSize: '0.88rem',
                  fontWeight: 600,
                }}
              >
                {addTeacherSuccess}
              </div>
            )}

            {addTeacherError && (
              <div
                style={{
                  backgroundColor: 'var(--bad-bg)',
                  color: 'var(--theme-danger)',
                  padding: '10px 14px',
                  borderRadius: 12,
                  fontSize: '0.88rem',
                  fontWeight: 600,
                }}
              >
                {addTeacherError}
              </div>
            )}

            <form onSubmit={handleRegisterAnotherTeacher} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: '0.84rem', fontWeight: 600 }}>Teacher Email</label>
                <input
                  type="email"
                  placeholder="colleague@school.edu"
                  value={newTeacherEmail}
                  onChange={(e) => setNewTeacherEmail(e.target.value)}
                  required
                  style={{
                    backgroundColor: 'var(--theme-page-bg)',
                    borderColor: 'var(--theme-border)',
                    borderRadius: 12,
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.84rem', fontWeight: 600 }}>Initial Password (min. 6 characters)</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={newTeacherPassword}
                  onChange={(e) => setNewTeacherPassword(e.target.value)}
                  required
                  style={{
                    backgroundColor: 'var(--theme-page-bg)',
                    borderColor: 'var(--theme-border)',
                    borderRadius: 12,
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.84rem', fontWeight: 600 }}>Confirm Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={newTeacherConfirm}
                  onChange={(e) => setNewTeacherConfirm(e.target.value)}
                  required
                  style={{
                    backgroundColor: 'var(--theme-page-bg)',
                    borderColor: 'var(--theme-border)',
                    borderRadius: 12,
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn secondary grow"
                  onClick={() => setShowAddTeacherModal(false)}
                  style={{ borderRadius: 12 }}
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="btn grow"
                  disabled={addTeacherBusy}
                  style={{
                    backgroundColor: 'var(--theme-primary)',
                    borderColor: 'var(--theme-primary)',
                    borderRadius: 12,
                  }}
                >
                  {addTeacherBusy ? 'Creating…' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unsubmitted Students Modal */}
      {unsubmittedModalEx && (() => {
        const unsubmittedList = getUnsubmittedStudents(unsubmittedModalEx.id);
        const origin = typeof window !== 'undefined' ? window.location.origin : '';

        const copyReminderForStudent = (s: Student) => {
          const parentLink = `${origin}/p/${s.parentToken}`;
          const msg = `សួស្តី! សូមរំលឹកថា ${s.name} មិនទាន់បានធ្វើលំហាត់ "${unsubmittedModalEx.title}" នៅឡើយទេ។ សូមចុចតំណនេះដើម្បីពិនិត្យ៖ ${parentLink}`;
          navigator.clipboard.writeText(msg);
          showToast(`Copied Khmer reminder for ${s.name}`);
        };

        const copyAllReminders = () => {
          if (!unsubmittedList.length) return;
          const allMsgs = unsubmittedList.map((s) => {
            const parentLink = `${origin}/p/${s.parentToken}`;
            return `សួស្តី! សូមរំលឹកថា ${s.name} មិនទាន់បានធ្វើលំហាត់ "${unsubmittedModalEx.title}" នៅឡើយទេ។ សូមចុចតំណនេះដើម្បីពិនិត្យ៖ ${parentLink}`;
          }).join('\n\n');
          navigator.clipboard.writeText(allMsgs);
          showToast(`Copied reminders for all ${unsubmittedList.length} students`);
        };

        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(4px)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
            onClick={() => setUnsubmittedModalEx(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                backgroundColor: 'var(--theme-card-bg)',
                borderRadius: 24,
                padding: '26px 24px',
                maxWidth: 580,
                width: '100%',
                maxHeight: '85vh',
                overflowY: 'auto',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 10,
                        backgroundColor: 'rgba(239, 68, 68, 0.12)',
                        color: 'var(--theme-danger)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <UserX size={18} />
                    </div>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--theme-navy)' }}>
                      Students Not Submitted
                    </h3>
                  </div>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.86rem', color: 'var(--theme-muted)' }}>
                    {unsubmittedModalEx.title} • {unsubmittedList.length} of {rosterStudents.length} active students have not submitted yet
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setUnsubmittedModalEx(null)}
                  style={{
                    border: 'none',
                    background: 'none',
                    color: 'var(--theme-muted)',
                    cursor: 'pointer',
                    padding: 4,
                  }}
                >
                  <X size={20} />
                </button>
              </div>

              {unsubmittedList.length === 0 ? (
                <div
                  style={{
                    padding: '32px 16px',
                    textAlign: 'center',
                    backgroundColor: 'var(--good-bg)',
                    borderRadius: 16,
                    color: 'var(--theme-success)',
                  }}
                >
                  <Check size={36} style={{ margin: '0 auto 8px auto', display: 'block' }} />
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem' }}>
                    All active students in your roster have submitted this exercise! 🎉
                  </p>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--theme-muted)', fontWeight: 600 }}>
                      Send reminders to parents via Telegram or Messenger:
                    </span>
                    <button
                      type="button"
                      className="btn secondary small"
                      onClick={copyAllReminders}
                      style={{
                        borderRadius: 10,
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <MessageSquare size={13} />
                      <span>Copy All Reminders</span>
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 380, overflowY: 'auto' }}>
                    {unsubmittedList.map((s) => {
                      const studentLink = `${origin}/s/${s.studentToken}`;
                      return (
                        <div
                          key={s.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '12px 14px',
                            backgroundColor: 'var(--theme-page-bg)',
                            borderRadius: 12,
                            border: '1px solid var(--theme-border-subtle)',
                            gap: 12,
                            flexWrap: 'wrap',
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.94rem', color: 'var(--theme-navy)' }}>
                              {s.name}
                            </div>
                            {s.className && (
                              <div style={{ fontSize: '0.76rem', color: 'var(--theme-muted)' }}>
                                Class: {s.className}
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="btn small"
                              onClick={() => copyReminderForStudent(s)}
                              style={{
                                borderRadius: 8,
                                padding: '5px 10px',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                backgroundColor: 'var(--theme-primary)',
                                borderColor: 'var(--theme-primary)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                              }}
                              title="Copy friendly Khmer reminder message with parent link"
                            >
                              <MessageSquare size={13} />
                              <span>Copy Reminder</span>
                            </button>
                            <button
                              type="button"
                              className="btn secondary small"
                              onClick={() => {
                                navigator.clipboard.writeText(studentLink);
                                showToast(`Copied student link for ${s.name}`);
                              }}
                              style={{
                                borderRadius: 8,
                                padding: '5px 8px',
                                fontSize: '0.78rem',
                              }}
                              title="Copy direct student link"
                            >
                              Student Link
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setUnsubmittedModalEx(null)}
                  style={{ borderRadius: 12, padding: '8px 20px', fontSize: '0.88rem' }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* =========================================================
          MODAL: Move Exercise to Grade & Chapter Modal
         ========================================================= */}
      {moveModalEx && (() => {
        // Compute available chapters for the selected grades in modal
        const modalChapters: string[] = [];
        (moveGrades.length > 0 ? moveGrades : [7, 8, 9, 10, 11, 12]).forEach((g) => {
          const chs = CAMBODIAN_MATH_CURRICULUM[g] || [];
          chs.forEach((c) => {
            if (c.titleKh && !modalChapters.includes(c.titleKh)) {
              modalChapters.push(c.titleKh);
            }
          });
        });
        // Also include any chapters currently used across exercises in this site
        (exercises || []).forEach((e) => {
          if (e.chapter && e.chapter.trim() && !modalChapters.includes(e.chapter.trim())) {
            modalChapters.push(e.chapter.trim());
          }
        });

        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.6)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: 16,
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setMoveModalEx(null);
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 480,
                backgroundColor: 'var(--theme-card-bg)',
                borderRadius: 20,
                padding: 24,
                boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
                border: '1px solid var(--theme-border)',
                maxHeight: '90vh',
                overflowY: 'auto',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FolderSymlink size={22} color="var(--theme-primary)" />
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--theme-navy)' }}>
                    {lang === 'KH' ? 'ផ្លាស់ប្តូរថ្នាក់ ឬជំពូក (Move Exercise)' : 'Move Exercise (Grade & Chapter)'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setMoveModalEx(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--theme-muted)' }}
                >
                  <X size={20} />
                </button>
              </div>

              <p style={{ margin: '0 0 16px 0', fontSize: '0.88rem', color: 'var(--theme-muted)' }}>
                {lang === 'KH' ? 'ចាត់ចែងលំហាត់ទៅកាន់ថ្នាក់ និងជំពូកដែលចង់បាន ៖' : 'Assign exercise to target grade folder and chapter:'}
                <br />
                <strong style={{ color: 'var(--theme-navy)' }}>{moveModalEx.title}</strong>
              </p>

              {/* SECTION 1: GRADE LEVELS */}
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--theme-navy)', marginBottom: 8 }}>
                  {lang === 'KH' ? '១. កម្រិតថ្នាក់ (Grade Folder)' : '1. Grade Level Folders'}
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {[7, 8, 9, 10, 11, 12].map((g) => {
                    const isChecked = moveGrades.includes(g);
                    return (
                      <label
                        key={g}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '8px 10px',
                          borderRadius: 10,
                          backgroundColor: isChecked ? 'rgba(59, 130, 246, 0.1)' : 'var(--theme-page-bg)',
                          border: isChecked ? '1.5px solid var(--theme-primary)' : '1px solid var(--theme-border)',
                          cursor: 'pointer',
                          fontSize: '0.82rem',
                          fontWeight: isChecked ? 700 : 500,
                          color: isChecked ? 'var(--theme-primary)' : 'var(--theme-navy)',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setMoveGrades((prev) => [...prev, g].sort((a, b) => a - b));
                            } else {
                              setMoveGrades((prev) => prev.filter((item) => item !== g));
                            }
                          }}
                          style={{ accentColor: 'var(--theme-primary)' }}
                        />
                        <span>ថ្នាក់ទី {g}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* SECTION 2: CHAPTER SELECTION */}
              <div style={{ marginBottom: 22 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--theme-navy)', margin: 0 }}>
                    {lang === 'KH' ? '២. ជំពូក (Chapter)' : '2. Target Chapter'}
                  </label>
                  {modalChapters.length > 0 && (
                    <select
                      style={{
                        fontSize: '0.75rem',
                        padding: '3px 8px',
                        borderRadius: 8,
                        border: '1px solid var(--theme-border)',
                        background: 'var(--theme-card-bg)',
                        color: 'var(--theme-navy)',
                        cursor: 'pointer',
                      }}
                      value=""
                      onChange={(e) => {
                        if (e.target.value) setMoveChapter(e.target.value);
                      }}
                    >
                      <option value="">{lang === 'KH' ? '— ជ្រើសរើសជំពូកដែលមាន —' : '— Pick Existing Chapter —'}</option>
                      {modalChapters.map((ch) => (
                        <option key={ch} value={ch}>{ch}</option>
                      ))}
                    </select>
                  )}
                </div>

                <input
                  type="text"
                  value={moveChapter}
                  onChange={(e) => setMoveChapter(e.target.value)}
                  placeholder={lang === 'KH' ? 'ឧទាហរណ៍៖ ជំពូកទី ១ ឬ គ្មានជំពូក (ទុកទទេ)' : 'e.g. Chapter 1 or leave empty for General'}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 10,
                    border: '1.5px solid var(--theme-border)',
                    backgroundColor: 'var(--theme-page-bg)',
                    color: 'var(--theme-navy)',
                    fontSize: '0.86rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.74rem', color: 'var(--theme-muted)' }}>
                    {lang === 'KH' ? 'ជម្រើសលឿន៖' : 'Quick options:'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMoveChapter('')}
                    style={{
                      fontSize: '0.72rem',
                      padding: '2px 8px',
                      borderRadius: 6,
                      border: '1px solid var(--theme-border)',
                      background: moveChapter === '' ? 'rgba(59, 130, 246, 0.15)' : 'none',
                      color: moveChapter === '' ? 'var(--theme-primary)' : 'var(--theme-muted)',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    {lang === 'KH' ? 'គ្មានជំពូក (ទូទៅ)' : 'No Chapter (General)'}
                  </button>
                  {modalChapters.slice(0, 3).map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => setMoveChapter(ch)}
                      style={{
                        fontSize: '0.72rem',
                        padding: '2px 8px',
                        borderRadius: 6,
                        border: '1px solid var(--theme-border)',
                        background: moveChapter === ch ? 'rgba(59, 130, 246, 0.15)' : 'none',
                        color: moveChapter === ch ? 'var(--theme-primary)' : 'var(--theme-muted)',
                        cursor: 'pointer',
                        fontWeight: 600,
                        maxWidth: 160,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={ch}
                    >
                      {ch}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setMoveModalEx(null)}
                  style={{ borderRadius: 10, padding: '8px 16px' }}
                >
                  {lang === 'KH' ? 'បោះបង់' : 'Cancel'}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={moveBusy || moveGrades.length === 0}
                  onClick={() => handleMoveExercise(moveModalEx, moveGrades, moveChapter)}
                  style={{
                    borderRadius: 10,
                    padding: '8px 20px',
                    backgroundColor: 'var(--theme-primary)',
                    color: '#fff',
                    fontWeight: 700,
                    border: 'none',
                    cursor: moveBusy || moveGrades.length === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  {moveBusy ? 'កំពុងផ្លាស់ប្តូរ…' : (lang === 'KH' ? 'រក្សាទុក (Move)' : 'Save / Move')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Mobile Sticky Bottom Navigation Dock */}
      <nav className="mobile-bottom-nav show-on-mobile-only" aria-label="Mobile Bottom Navigation">
        <button
          type="button"
          className={`mobile-nav-btn ${activeSection === 'dashboard' ? 'active' : ''}`}
          onClick={() => scrollToSection('dashboard-top', 'dashboard')}
        >
          <LayoutDashboard size={20} />
          <span>Home</span>
        </button>
        <button
          type="button"
          className={`mobile-nav-btn ${activeSection === 'exercises' ? 'active' : ''}`}
          onClick={() => scrollToSection('my-exercises-section', 'exercises')}
        >
          <BookOpen size={20} />
          <span>Tests</span>
        </button>
        <Link
          href="/admin/students"
          className="mobile-nav-btn"
          style={{ textDecoration: 'none' }}
        >
          <Users size={20} />
          <span>Students</span>
        </Link>
        <Link
          href="/admin/exercises/new"
          className="mobile-nav-btn"
          style={{ textDecoration: 'none' }}
        >
          <Plus size={20} />
          <span>New</span>
        </Link>
        <button
          type="button"
          className="mobile-nav-btn"
          onClick={() => setMobileMenuOpen(true)}
        >
          <Menu size={20} />
          <span>Menu</span>
        </button>
      </nav>

      {/* Responsive mobile & laptop style overrides */}
      <style jsx>{`
        /* Laptop optimizations (1024px - 1280px) */
        @media (min-width: 1024px) and (max-width: 1280px) {
          .center-column-span {
            grid-column: span 7 !important;
          }
          .right-column-span {
            grid-column: span 5 !important;
          }
          .dashboard-main-content {
            padding: 20px 20px 48px !important;
          }
        }

        /* Tablet & Mobile (<= 1024px) */
        @media (max-width: 1024px) {
          .hide-on-mobile {
            display: none !important;
          }
          .center-column-span {
            grid-column: span 12 !important;
          }
          .right-column-span {
            grid-column: span 12 !important;
          }
          .accuracy-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          .dashboard-main-content {
            padding: 14px 12px 90px !important;
          }
          .dashboard-toast {
            bottom: 76px !important;
            right: 14px !important;
            left: 14px !important;
            justify-content: center !important;
          }
        }

        /* Small Phones (<= 640px) */
        @media (max-width: 640px) {
          .stat-cards-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 10px !important;
          }
          .greeting-illustration {
            width: 85px !important;
            height: 70px !important;
          }
          .exercise-row-container {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 12px !important;
            padding: 14px 14px !important;
          }
          .exercise-row-actions {
            width: 100% !important;
            justify-content: flex-end !important;
            border-top: 1px solid var(--theme-border-subtle);
            padding-top: 10px;
          }
          .accuracy-grid {
            grid-template-columns: 1fr !important;
          }
          .chart-container-mobile {
            width: 100% !important;
            min-width: 0 !important;
            justify-content: space-between !important;
          }
          .chart-bars-wrap {
            gap: 6px !important;
          }
          .chart-bar-item {
            width: auto !important;
            flex: 1 !important;
            max-width: 34px !important;
            min-width: 16px !important;
          }
        }
      `}</style>
    </div>
  );
}
