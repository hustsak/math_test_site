'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { useAdmin } from '@/lib/useAdmin';
import { adminPost } from '@/lib/authFetch';
import type { StudentAccess, StudentAccessStatus, ProfileWithStats } from '@/lib/types';
import { gradeCode, gradeLabelEn, gradeLabelKh, isNumericGrade, type GradeCodes } from '@/lib/gradeLabels';
import {
  Users,
  Search,
  Plus,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldAlert,
  Edit2,
  Trash2,
  RefreshCw,
  QrCode,
  Copy,
  Printer,
  ArrowLeft,
  X,
  Filter,
  Check,
  ChevronRight,
  Sun,
  Moon,
  ExternalLink,
  Ban,
  Sparkles,
} from 'lucide-react';

export default function AdminStudentsPage() {
  const { user, loading: authLoading, isAdmin } = useAdmin();

  // Tab switcher: 'access' (Student Access & Expiry) | 'parent' (Parent Tracking & QR)
  const [activeTab, setActiveTab] = useState<'access' | 'parent'>('access');

  // Theme & Language
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [lang, setLang] = useState<'KH' | 'EN'>('KH');

  // Student Access State
  const [students, setStudents] = useState<StudentAccess[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [studentError, setStudentError] = useState('');

  // Parent Profiles State
  const [profiles, setProfiles] = useState<ProfileWithStats[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [showHiddenProfiles, setShowHiddenProfiles] = useState(false);
  const [showClassAverage, setShowClassAverage] = useState(false);
  const [customGrades, setCustomGrades] = useState<(number | string)[]>([7, 8, 9, 10, 11, 12]);
  const [gradeCodes, setGradeCodes] = useState<GradeCodes>({});
  const [customClasses, setCustomClasses] = useState<string[]>([]);

  // Filters & Search (Access tab)
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedGrade, setSelectedGrade] = useState<string>('all');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentAccess | null>(null);
  const [extendingStudent, setExtendingStudent] = useState<StudentAccess | null>(null);
  const [blockingStudent, setBlockingStudent] = useState<StudentAccess | null>(null);
  const [deletingStudent, setDeletingStudent] = useState<StudentAccess | null>(null);
  const [qrStudent, setQrStudent] = useState<{ name: string; className?: string; token: string } | null>(null);
  const [historyStudent, setHistoryStudent] = useState<StudentAccess | null>(null);
  const [studentSubmissions, setStudentSubmissions] = useState<any[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);

  // Form states for Add / Edit
  const [formName, setFormName] = useState('');
  const [formGrade, setFormGrade] = useState<number>(7);
  const [formGrades, setFormGrades] = useState<number[]>([7]);
  const [formClassName, setFormClassName] = useState('');
  const [formExpiration, setFormExpiration] = useState('');
  const [formAccessEnabled, setFormAccessEnabled] = useState(true);
  const [formPaymentStatus, setFormPaymentStatus] = useState<'approved' | 'pending'>('approved');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  function toggleGradeSelection(g: number | string) {
    const val = gradeCode(g, gradeCodes);
    if (val === null) return; // named class without a grade number yet
    setFormGrades((prev) => {
      if (prev.includes(val)) {
        if (prev.length === 1) return prev; // Keep at least 1 grade
        const updated = prev.filter((item) => item !== val);
        setFormGrade(updated[0]);
        return updated;
      } else {
        const updated = [...prev, val].sort((a, b) => a - b);
        setFormGrade(updated[0]);
        return updated;
      }
    });
  }

  // Payment Quick Approval state
  const [paymentTogglingId, setPaymentTogglingId] = useState<string | null>(null);

  // Extension Modal state
  const [customExtDate, setCustomExtDate] = useState('');
  const [extSubmitting, setExtSubmitting] = useState(false);

  // Toast
  const [toast, setToast] = useState('');

  // Print Mode
  const [isPrintMode, setIsPrintMode] = useState(false);

  // Parent tracking rename/merge modal
  const [mergeModalProfile, setMergeModalProfile] = useState<ProfileWithStats | null>(null);
  const [mergeMode, setMergeMode] = useState<'rename' | 'merge'>('rename');
  const [renameName, setRenameName] = useState('');
  const [renameClass, setRenameClass] = useState('');
  const [targetMergeId, setTargetMergeId] = useState('');
  const [mergeBusy, setMergeBusy] = useState(false);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  // Load theme preference
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

  // Load Students Access Data
  async function loadStudents() {
    setLoadingStudents(true);
    setStudentError('');
    try {
      const token = await user?.getIdToken();
      const res = await fetch('/api/admin/students', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load students.');
      const data = await res.json();
      setStudents(data.students || []);
    } catch (e: any) {
      setStudentError(e?.message || 'Error loading student list.');
    } finally {
      setLoadingStudents(false);
    }
  }

  // Load Parent Profiles Data
  async function loadProfiles() {
    setLoadingProfiles(true);
    try {
      const token = await user?.getIdToken();
      const [pRes, sRes] = await Promise.all([
        fetch('/api/admin/profiles', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/settings', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (pRes.ok) {
        const pData = await pRes.json();
        setProfiles(pData.profiles || []);
      }
      if (sRes.ok) {
        const sData = await sRes.json();
        setShowClassAverage(!!sData.showClassAverageToParents);
        if (Array.isArray(sData.customGrades) && sData.customGrades.length > 0) {
          setCustomGrades(sData.customGrades);
        }
        if (sData.gradeCodes && typeof sData.gradeCodes === 'object') {
          setGradeCodes(sData.gradeCodes as GradeCodes);
        }
        if (Array.isArray(sData.customClasses)) {
          setCustomClasses(sData.customClasses);
        }
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoadingProfiles(false);
    }
  }

  useEffect(() => {
    if (isAdmin) {
      loadStudents();
      loadProfiles();
    }
  }, [isAdmin]);

  // Helper: Get Cambodia default date (+30 days)
  function getDefaultExpirationDate(): string {
    const d = new Date(Date.now() + 7 * 60 * 60 * 1000 + 30 * 24 * 60 * 60 * 1000);
    return d.toISOString().split('T')[0];
  }

  function openAddModal() {
    setFormName('');
    setFormGrade(7);
    setFormGrades([7]);
    setFormClassName('');
    setFormExpiration(getDefaultExpirationDate());
    setFormAccessEnabled(true);
    setFormPaymentStatus('approved');
    setFormError('');
    setShowAddModal(true);
  }

  function openEditModal(s: StudentAccess) {
    setEditingStudent(s);
    setFormName(s.name);
    const enrolled = Array.isArray(s.grades) && s.grades.length > 0 ? s.grades : [s.grade || 7];
    setFormGrade(enrolled[0]);
    setFormGrades(enrolled);
    setFormClassName(s.className || '');
    setFormExpiration(s.expirationDate);
    setFormAccessEnabled(s.accessEnabled);
    setFormPaymentStatus(s.paymentStatus || 'approved');
    setFormError('');
  }

  // View Student Submission History
  async function handleViewSubmissions(s: StudentAccess) {
    setHistoryStudent(s);
    setLoadingSubmissions(true);
    setStudentSubmissions([]);
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/admin/students/${s.id}/submissions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStudentSubmissions(data.submissions || []);
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoadingSubmissions(false);
    }
  }

  // Quick Toggle Payment Approval directly from table
  async function handleTogglePaymentApproval(s: StudentAccess) {
    const nextStatus = s.paymentStatus === 'pending' ? 'approved' : 'pending';
    setPaymentTogglingId(s.id);
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/admin/students/${s.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ paymentStatus: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update payment status.');

      showToast(
        nextStatus === 'approved'
          ? (lang === 'KH' ? `✓ បានអនុម័តការបង់ប្រាក់សម្រាប់ "${s.name}"!` : `Payment approved for "${s.name}"!`)
          : (lang === 'KH' ? `បានប្ដូរ "${s.name}" ទៅរង់ចាំបង់ប្រាក់` : `Set "${s.name}" to pending payment.`)
      );
      loadStudents();
    } catch (err: any) {
      alert(err?.message || 'Error updating payment status.');
    } finally {
      setPaymentTogglingId(null);
    }
  }

  // Submit Add Student
  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Please enter the student name.');
      return;
    }
    if (!formExpiration) {
      setFormError('Please set an expiration date.');
      return;
    }

    setFormSubmitting(true);
    setFormError('');
    try {
      const res = await adminPost('/api/admin/students', {
        name: formName.trim(),
        grade: formGrades[0] || formGrade,
        grades: formGrades,
        className: formClassName.trim() || null,
        expirationDate: formExpiration,
        accessEnabled: formAccessEnabled,
        paymentStatus: formPaymentStatus,
      });

      if (res.warning) {
        showToast(`⚠️ ${res.warning}`);
      } else {
        showToast(
          lang === 'KH'
            ? `បានបន្ថែមសិស្ស "${formName.trim()}" ដោយជោគជ័យ!`
            : `Student "${formName.trim()}" added successfully!`
        );
      }

      setShowAddModal(false);
      loadStudents();
      loadProfiles();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to add student.');
    } finally {
      setFormSubmitting(false);
    }
  }

  // Submit Edit Student
  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingStudent) return;
    if (!formName.trim()) {
      setFormError('Please enter the student name.');
      return;
    }
    if (!formExpiration) {
      setFormError('Please set an expiration date.');
      return;
    }

    setFormSubmitting(true);
    setFormError('');
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/admin/students/${editingStudent.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: formName.trim(),
          grade: formGrades[0] || formGrade,
          grades: formGrades,
          className: formClassName.trim() || null,
          expirationDate: formExpiration,
          accessEnabled: formAccessEnabled,
          paymentStatus: formPaymentStatus,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update student.');

      showToast(
        lang === 'KH'
          ? `បានកែសម្រួលទិន្នន័យ "${formName.trim()}" ដោយជោគជ័យ!`
          : `Updated student "${formName.trim()}" successfully!`
      );
      setEditingStudent(null);
      loadStudents();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to update student.');
    } finally {
      setFormSubmitting(false);
    }
  }

  // Extend Expiration (Quick preset or custom date)
  async function handleExtend(days: number, customDate?: string) {
    if (!extendingStudent) return;
    setExtSubmitting(true);
    try {
      const token = await user?.getIdToken();
      const bodyPayload = customDate ? { expirationDate: customDate } : { extensionDays: days };

      const res = await fetch(`/api/admin/students/${extendingStudent.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(bodyPayload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to extend access.');

      showToast(
        lang === 'KH'
          ? `បានបន្តការចូលប្រើសម្រាប់ "${extendingStudent.name}"!`
          : `Extended access for "${extendingStudent.name}"!`
      );
      setExtendingStudent(null);
      setCustomExtDate('');
      loadStudents();
    } catch (err: any) {
      alert(err?.message || 'Error extending access.');
    } finally {
      setExtSubmitting(false);
    }
  }

  // Toggle Block / Activate
  async function handleToggleBlock() {
    if (!blockingStudent) return;
    const nextEnabled = !blockingStudent.accessEnabled;
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/admin/students/${blockingStudent.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ accessEnabled: nextEnabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update status.');

      showToast(
        nextEnabled
          ? lang === 'KH'
            ? `បានបើកដំណើរការសិស្ស "${blockingStudent.name}" ឡើងវិញ!`
            : `Activated "${blockingStudent.name}"!`
          : lang === 'KH'
          ? `បានផ្អាកការចូលប្រើរបស់ "${blockingStudent.name}"!`
          : `Paused access for "${blockingStudent.name}"!`
      );
      setBlockingStudent(null);
      loadStudents();
    } catch (err: any) {
      alert(err?.message || 'Error updating access.');
    }
  }

  // Delete Student
  async function handleDeleteStudent() {
    if (!deletingStudent) return;
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/admin/students/${deletingStudent.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete student.');

      showToast(
        lang === 'KH'
          ? `បានលុបសិស្ស "${deletingStudent.name}" (លទ្ធផលប្រឡងចាស់នៅតែរក្សាទុក)!`
          : `Deleted student "${deletingStudent.name}" (historical submissions preserved)!`
      );
      setDeletingStudent(null);
      loadStudents();
    } catch (err: any) {
      alert(err?.message || 'Error deleting student.');
    }
  }

  // Single-use student links: every "Copy Link" makes a NEW one-time invite. The first browser that
  // opens it is signed in; a forwarded copy (or the address-bar URL) errors on any other device.
  async function createStudentInviteUrl(s: StudentAccess): Promise<string> {
    const res = await adminPost<{ path: string }>('/api/admin/students/invite', { studentId: s.id });
    setStudents((prev: StudentAccess[]) => prev.map((x: StudentAccess) => (x.id === s.id ? { ...x, linkLocked: true } : x)));
    return `${window.location.origin}${res.path}`;
  }

  async function handleCopyStudentInvite(s: StudentAccess) {
    try {
      const url = await createStudentInviteUrl(s);
      try {
        await navigator.clipboard.writeText(url);
        showToast(
          lang === 'KH'
            ? `បានចម្លងតំណប្រើម្តង សម្រាប់ ${s.name}! ផ្ញើវាទៅសិស្សនេះតែម្នាក់។`
            : `Copied one-time link for ${s.name}! Send it to this student only.`
        );
      } catch {
        // Some browsers refuse clipboard access after a network call: let the teacher copy it by hand.
        window.prompt(lang === 'KH' ? 'ចម្លងតំណនេះ ៖' : 'Copy this one-time link:', url);
      }
    } catch (err: any) {
      alert(err?.message || 'Could not create the student link.');
    }
  }

  async function handleOpenStudentInvite(s: StudentAccess) {
    // Open the tab first (browsers block pop-ups opened after a network call), then point it at the invite.
    const tab = window.open('', '_blank');
    try {
      const url = await createStudentInviteUrl(s);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (err: any) {
      tab?.close();
      alert(err?.message || 'Could not open the student portal.');
    }
  }

  async function handleUnlockStudentLink(s: StudentAccess) {
    const ok = confirm(
      lang === 'KH'
        ? `ដោះសោតំណរបស់ ${s.name}? បន្ទាប់ពីនោះ តំណ /s/… ចាស់អាចបើកបានលើគ្រប់ឧបករណ៍ម្តងទៀត។`
        : `Unlock ${s.name}'s link? Anyone with the plain /s/… link will be able to open it again.`
    );
    if (!ok) return;
    try {
      await adminPost('/api/admin/students/invite', { studentId: s.id, unlock: true });
      setStudents((prev: StudentAccess[]) => prev.map((x: StudentAccess) => (x.id === s.id ? { ...x, linkLocked: false } : x)));
      showToast(lang === 'KH' ? `បានដោះសោតំណរបស់ ${s.name}` : `Unlocked ${s.name}'s link`);
    } catch (err: any) {
      alert(err?.message || 'Could not unlock the link.');
    }
  }

  // Parent Tracking Functions
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  function getParentLink(token: string) {
    return `${origin}/p/${token}`;
  }

  function copyParentMessage(p: ProfileWithStats) {
    const link = getParentLink(p.parentToken);
    const msg =
      lang === 'KH'
        ? `សួស្តី! នេះជាតំណផ្ទាល់ខ្លួនសម្រាប់តាមដានលទ្ធផលលំហាត់របស់ ${p.name} ៖ ${link}`
        : `Hello! Here is your private link to follow ${p.name}'s math exercises and results: ${link}`;
    navigator.clipboard.writeText(msg);
    showToast(`Copied ${lang === 'KH' ? 'Khmer' : 'English'} parent message for ${p.name}!`);
  }

  async function handleToggleClassAverage(val: boolean) {
    setShowClassAverage(val);
    try {
      await adminPost('/api/admin/settings', { showClassAverageToParents: val });
      showToast(val ? 'Class average is now shown to parents' : 'Class average hidden from parents');
    } catch (e: any) {
      alert('Failed to update setting: ' + (e?.message || 'Error'));
    }
  }

  async function handleToggleHideProfile(p: ProfileWithStats) {
    const nextHidden = !p.hidden;
    try {
      await adminPost('/api/admin/profiles/hide', { profileId: p.id, hidden: nextHidden });
      showToast(nextHidden ? `Hidden profile for ${p.name}` : `Restored profile for ${p.name}`);
      setProfiles((prev) =>
        prev.map((item) => (item.id === p.id ? { ...item, hidden: nextHidden } : item))
      );
    } catch (e: any) {
      alert('Failed to update: ' + (e?.message || 'Error'));
    }
  }

  function openMergeModal(p: ProfileWithStats) {
    setMergeModalProfile(p);
    setMergeMode('rename');
    setRenameName(p.name);
    setRenameClass(p.className || '');
    setTargetMergeId('');
  }

  async function handleMergeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!mergeModalProfile) return;
    setMergeBusy(true);
    try {
      if (mergeMode === 'rename') {
        if (!renameName.trim()) return;
        await adminPost('/api/admin/profiles/merge', {
          sourceProfileId: mergeModalProfile.id,
          newName: renameName.trim(),
          newClass: renameClass.trim(),
        });
        showToast(`Renamed to "${renameName.trim()}"`);
      } else {
        if (!targetMergeId) {
          alert('Please select a student to merge into.');
          return;
        }
        const ok = window.confirm(
          `Merge all submissions from "${mergeModalProfile.name}" into the selected student?\n\nThis cannot be undone!`
        );
        if (!ok) return;
        await adminPost('/api/admin/profiles/merge', {
          sourceProfileId: mergeModalProfile.id,
          targetProfileId: targetMergeId,
        });
        showToast('Submissions merged successfully!');
      }
      setMergeModalProfile(null);
      loadProfiles();
    } catch (err: any) {
      alert('Action failed: ' + (err?.message || 'Error'));
    } finally {
      setMergeBusy(false);
    }
  }

  // Filtered Students List
  const uniqueClasses = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      if (s.className) set.add(s.className);
    });
    return Array.from(set).sort();
  }, [students]);

  const stats = useMemo(() => {
    let active = 0;
    let expiring = 0;
    let expired = 0;
    let blocked = 0;

    students.forEach((s) => {
      if (s.status === 'blocked') blocked++;
      else if (s.status === 'expired') expired++;
      else if (s.status === 'expiring_soon') expiring++;
      else if (s.status === 'active') active++;
    });

    return { total: students.length, active, expiring, expired, blocked };
  }, [students]);

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        const matchName = s.name.toLowerCase().includes(q);
        const matchClass = s.className?.toLowerCase().includes(q);
        if (!matchName && !matchClass) return false;
      }
      // Class filter
      if (selectedClass !== 'all') {
        if ((s.className || 'none') !== selectedClass) return false;
      }
      // Status filter
      if (selectedStatus !== 'all') {
        if (s.status !== selectedStatus) return false;
      }
      // Grade filter (7-12)
      if (selectedGrade !== 'all') {
        const targetG = Number(selectedGrade);
        const enrolled = Array.isArray(s.grades) && s.grades.length > 0 ? s.grades : [s.grade || 7];
        if (!enrolled.includes(targetG)) return false;
      }
      return true;
    });
  }, [students, searchTerm, selectedStatus, selectedGrade]);

  // Status Badge Component
  function StatusBadge({ status }: { status: StudentAccessStatus }) {
    switch (status) {
      case 'active':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: '0.8rem',
              fontWeight: 800,
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              color: '#059669',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}
          >
            <CheckCircle2 size={13} />
            <span>{lang === 'KH' ? 'សកម្ម (Active)' : 'Active'}</span>
          </span>
        );
      case 'expiring_soon':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: '0.8rem',
              fontWeight: 800,
              backgroundColor: 'rgba(245, 158, 11, 0.14)',
              color: '#d97706',
              border: '1px solid rgba(245, 158, 11, 0.35)',
            }}
          >
            <Clock size={13} />
            <span>{lang === 'KH' ? 'ជិតផុតកំណត់ (Expiring)' : 'Expiring Soon'}</span>
          </span>
        );
      case 'expired':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: '0.8rem',
              fontWeight: 800,
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              color: '#dc2626',
              border: '1px solid rgba(239, 68, 68, 0.3)',
            }}
          >
            <XCircle size={13} />
            <span>{lang === 'KH' ? 'ផុតកំណត់ (Expired)' : 'Expired'}</span>
          </span>
        );
      case 'pending_payment':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: '0.8rem',
              fontWeight: 800,
              backgroundColor: 'rgba(234, 88, 12, 0.14)',
              color: '#ea580c',
              border: '1px solid rgba(234, 88, 12, 0.35)',
            }}
          >
            <span>⏳</span>
            <span>{lang === 'KH' ? 'រង់ចាំបង់ប្រាក់ (Pending Payment)' : 'Pending Payment'}</span>
          </span>
        );
      case 'blocked':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: '0.8rem',
              fontWeight: 800,
              backgroundColor: 'rgba(100, 116, 139, 0.14)',
              color: '#475569',
              border: '1px solid rgba(100, 116, 139, 0.3)',
            }}
          >
            <Ban size={13} />
            <span>{lang === 'KH' ? 'បានផ្អាក (Blocked)' : 'Blocked'}</span>
          </span>
        );
    }
  }

  // Print Mode
  if (isPrintMode) {
    const visibleProfiles = profiles.filter((p) => showHiddenProfiles || !p.hidden);
    return (
      <div style={{ backgroundColor: '#ffffff', color: '#000000', padding: 20 }}>
        <div className="no-print" style={{ marginBottom: 20, display: 'flex', gap: 12 }}>
          <button
            type="button"
            className="btn"
            onClick={() => window.print()}
            style={{ backgroundColor: '#2563eb', color: '#fff', padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700 }}
          >
            🖨️ Print Now
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={() => setIsPrintMode(false)}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #ccc', cursor: 'pointer' }}
          >
            Exit Print View
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {visibleProfiles.map((p) => (
            <div
              key={p.id}
              style={{
                border: '2px dashed #94a3b8',
                borderRadius: 12,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                pageBreakInside: 'avoid',
                textAlign: 'center',
              }}
            >
              <div>
                <h3 style={{ margin: '0 0 2px 0', fontSize: '1.15rem', fontWeight: 900 }}>{p.name}</h3>
                {p.className && <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Class: {p.className}</span>}
              </div>
              <QRCodeSVG value={getParentLink(p.parentToken)} size={130} />
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#16a34a' }}>Parent Tracking QR</div>
              <div style={{ fontSize: '0.7rem', color: '#64748b' }}>ស្កេនដើម្បីមើលលទ្ធផលកូន / Scan to follow results</div>
            </div>
          ))}
        </div>

        <style jsx global>{`
          @media print {
            .no-print {
              display: none !important;
            }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--theme-page-bg)', padding: '24px 20px 80px 20px' }}>
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
            fontWeight: 700,
            fontSize: '0.92rem',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            maxWidth: 420,
          }}
        >
          <CheckCircle2 size={18} color="#34d399" />
          <span>{toast}</span>
        </div>
      )}

      <div style={{ maxWidth: 1140, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Top Header Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link
              href="/admin"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 10,
                backgroundColor: 'var(--theme-card-bg)',
                border: '1px solid var(--theme-border)',
                color: 'var(--theme-navy)',
                fontSize: '0.85rem',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              <ArrowLeft size={16} />
              <span>{lang === 'KH' ? 'ត្រឡប់ទៅផ្ទាំងគ្រប់គ្រង' : 'Back to Dashboard'}</span>
            </Link>

            <div>
              <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 900, color: 'var(--theme-navy)' }}>
                {lang === 'KH' ? 'ការគ្រប់គ្រងសិស្ស & ការចូលប្រើ' : 'Student Management & Access Control'}
              </h1>
              <span style={{ fontSize: '0.82rem', color: 'var(--theme-muted)' }}>
                {lang === 'KH'
                  ? 'កំណត់ការអនុញ្ញាត និងកាលបរិច្ឆេទផុតកំណត់សម្រាប់សិស្សម្នាក់ៗ (Asia/Phnom_Penh)'
                  : 'Manage approved students and expiration dates (Cambodia Timezone UTC+7)'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Language toggle */}
            <button
              type="button"
              onClick={() => setLang((prev) => (prev === 'KH' ? 'EN' : 'KH'))}
              className="btn small secondary"
              style={{ borderRadius: 10, padding: '7px 12px', fontSize: '0.82rem', fontWeight: 800 }}
            >
              {lang === 'KH' ? '🇰🇭 ខ្មែរ' : '🇬🇧 EN'}
            </button>

            {/* Theme toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="btn small secondary"
              style={{ borderRadius: 10, padding: '7px 10px' }}
              aria-label="Toggle theme"
            >
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </button>
          </div>
        </div>

        {/* Tab Switcher: Access vs Parent Tracking */}
        <div
          style={{
            display: 'flex',
            backgroundColor: 'var(--theme-card-bg)',
            borderRadius: 14,
            padding: 4,
            border: '1px solid var(--theme-border)',
            gap: 6,
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('access')}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: 10,
              border: 'none',
              backgroundColor: activeTab === 'access' ? 'var(--theme-primary)' : 'transparent',
              color: activeTab === 'access' ? '#ffffff' : 'var(--theme-navy)',
              fontWeight: 800,
              fontSize: '0.92rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'all 0.15s ease',
            }}
          >
            <Users size={18} />
            <span>
              {lang === 'KH'
                ? `សិស្សអនុញ្ញាត & ផុតកំណត់ (${students.length})`
                : `Student Access & Expiry (${students.length})`}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('parent')}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: 10,
              border: 'none',
              backgroundColor: activeTab === 'parent' ? 'var(--theme-primary)' : 'transparent',
              color: activeTab === 'parent' ? '#ffffff' : 'var(--theme-navy)',
              fontWeight: 800,
              fontSize: '0.92rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'all 0.15s ease',
            }}
          >
            <QrCode size={18} />
            <span>
              {lang === 'KH'
                ? `តំណតាមដានសម្រាប់មាតាបិតា (${profiles.length})`
                : `Parent Tracking & QR (${profiles.length})`}
            </span>
          </button>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: STUDENT ACCESS & EXPIRATION CONTROL */}
        {/* ========================================================================= */}
        {activeTab === 'access' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Summary Metric Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
              <div
                style={{
                  backgroundColor: 'var(--theme-card-bg)',
                  borderRadius: 14,
                  padding: '14px 16px',
                  border: '1px solid var(--theme-border)',
                }}
              >
                <div style={{ fontSize: '0.78rem', color: 'var(--theme-muted)', fontWeight: 700 }}>
                  {lang === 'KH' ? 'សរុបសិស្សអនុញ្ញាត' : 'Total Approved'}
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--theme-navy)', marginTop: 4 }}>
                  {stats.total}
                </div>
              </div>

              <div
                style={{
                  backgroundColor: 'var(--theme-card-bg)',
                  borderRadius: 14,
                  padding: '14px 16px',
                  border: '1px solid var(--theme-border)',
                  cursor: 'pointer',
                }}
                onClick={() => setSelectedStatus(selectedStatus === 'active' ? 'all' : 'active')}
              >
                <div style={{ fontSize: '0.78rem', color: '#059669', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={14} />
                  <span>{lang === 'KH' ? 'កំពុងមានសិទ្ធិ' : 'Active'}</span>
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#059669', marginTop: 4 }}>
                  {stats.active}
                </div>
              </div>

              <div
                style={{
                  backgroundColor: 'var(--theme-card-bg)',
                  borderRadius: 14,
                  padding: '14px 16px',
                  border: '1px solid var(--theme-border)',
                  cursor: 'pointer',
                }}
                onClick={() => setSelectedStatus(selectedStatus === 'expiring_soon' ? 'all' : 'expiring_soon')}
              >
                <div style={{ fontSize: '0.78rem', color: '#d97706', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={14} />
                  <span>{lang === 'KH' ? 'ជិតផុតកំណត់ (<= 7 ថ្ងៃ)' : 'Expiring Soon'}</span>
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#d97706', marginTop: 4 }}>
                  {stats.expiring}
                </div>
              </div>

              <div
                style={{
                  backgroundColor: 'var(--theme-card-bg)',
                  borderRadius: 14,
                  padding: '14px 16px',
                  border: '1px solid var(--theme-border)',
                  cursor: 'pointer',
                }}
                onClick={() => setSelectedStatus(selectedStatus === 'expired' ? 'all' : 'expired')}
              >
                <div style={{ fontSize: '0.78rem', color: '#dc2626', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <XCircle size={14} />
                  <span>{lang === 'KH' ? 'ផុតកំណត់ហើយ' : 'Expired'}</span>
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#dc2626', marginTop: 4 }}>
                  {stats.expired}
                </div>
              </div>

              <div
                style={{
                  backgroundColor: 'var(--theme-card-bg)',
                  borderRadius: 14,
                  padding: '14px 16px',
                  border: '1px solid var(--theme-border)',
                  cursor: 'pointer',
                }}
                onClick={() => setSelectedStatus(selectedStatus === 'blocked' ? 'all' : 'blocked')}
              >
                <div style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Ban size={14} />
                  <span>{lang === 'KH' ? 'បានផ្អាក' : 'Blocked'}</span>
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#475569', marginTop: 4 }}>
                  {stats.blocked}
                </div>
              </div>
            </div>

              <div
                style={{
                  backgroundColor: 'var(--theme-card-bg)',
                  borderRadius: 16,
                  padding: '16px 18px',
                  border: '1px solid var(--theme-border)',
                  boxShadow: 'var(--theme-shadow)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        backgroundColor: 'rgba(74, 103, 214, 0.12)',
                        color: 'var(--theme-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Sparkles size={16} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 900, color: 'var(--theme-navy)' }}>
                        {lang === 'KH' ? 'តំណភ្ជាប់អចិន្ត្រៃយ៍សម្រាប់សិស្សតាមកម្រិតថ្នាក់ (Permanent Student Links)' : 'Permanent Student Links by Grade'}
                      </h3>
                      <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--theme-muted)' }}>
                        {lang === 'KH'
                          ? 'ផ្ញើតំណនេះទៅសិស្សតាមថ្នាក់នីមួយៗ (សិស្សគ្រាន់តែវាយឈ្មោះដើម្បីចូលរៀន)'
                          : 'Send these grade-specific links to students. Students simply enter their name to access.'}
                      </p>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: 10,
                  }}
                >
                  {(customGrades.length > 0 ? customGrades : [7, 8, 9, 10, 11, 12]).map((g) => {
                    const isNum = isNumericGrade(g);
                    const linkCode = gradeCode(g, gradeCodes);
                    const gradePath = linkCode !== null ? `/student/grade-${linkCode}` : `/student/${encodeURIComponent(String(g).toLowerCase())}`;
                    const fullGradeUrl = typeof window !== 'undefined' ? `${window.location.origin}${gradePath}` : gradePath;
                    const label = isNum ? `ថ្នាក់ទី ${g}` : String(g);
                    return (
                      <div
                        key={String(g)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          padding: '10px 12px',
                          borderRadius: 10,
                          backgroundColor: 'var(--theme-page-bg)',
                          border: '1px solid var(--theme-border)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <span
                            style={{
                              padding: '3px 8px',
                              borderRadius: 6,
                              backgroundColor: 'rgba(74, 103, 214, 0.15)',
                              color: 'var(--theme-primary)',
                              fontSize: '0.8rem',
                              fontWeight: 900,
                              flexShrink: 0,
                            }}
                          >
                            {label}
                          </span>
                          <span
                            style={{
                              fontSize: '0.82rem',
                              color: 'var(--theme-navy)',
                              fontFamily: 'monospace',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={fullGradeUrl}
                          >
                            {gradePath}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(fullGradeUrl);
                              setToast(lang === 'KH' ? `បានចម្លងតំណ ${isNum ? `ថ្នាក់ទី ${g}` : String(g)}!` : `Copied ${isNum ? `Grade ${g}` : String(g)} Link!`);
                              setTimeout(() => setToast(''), 3000);
                            }}
                            className="btn small secondary"
                            style={{
                              padding: '5px 9px',
                              borderRadius: 7,
                              fontSize: '0.75rem',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontWeight: 700,
                            }}
                            title="Copy link"
                          >
                            <Copy size={13} />
                            <span>{lang === 'KH' ? 'ចម្លង' : 'Copy'}</span>
                          </button>
                          <a
                            href={gradePath}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              padding: '5px 8px',
                              borderRadius: 7,
                              backgroundColor: 'transparent',
                              border: '1px solid var(--theme-border)',
                              color: 'var(--theme-muted)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              textDecoration: 'none',
                            }}
                            title="Open link in new tab"
                          >
                            <ExternalLink size={13} />
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            {/* Action Bar: Search, Filters & Add Student Button */}
            <div
              style={{
                backgroundColor: 'var(--theme-card-bg)',
                borderRadius: 16,
                padding: '16px 18px',
                border: '1px solid var(--theme-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1 }}>
                {/* Search Input */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    borderRadius: 10,
                    backgroundColor: 'var(--theme-page-bg)',
                    border: '1px solid var(--theme-border)',
                    minWidth: 220,
                    maxWidth: 320,
                    flex: 1,
                  }}
                >
                  <Search size={16} color="var(--theme-muted)" />
                  <input
                    type="text"
                    placeholder={lang === 'KH' ? 'ស្វែងរកតាមឈ្មោះសិស្ស…' : 'Search by student name…'}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{
                      border: 'none',
                      background: 'none',
                      color: 'var(--theme-navy)',
                      fontSize: '0.88rem',
                      width: '100%',
                      outline: 'none',
                    }}
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      <X size={14} color="var(--theme-muted)" />
                    </button>
                  )}
                </div>

                {/* Grade Filter */}
                <select
                  value={selectedGrade}
                  onChange={(e) => setSelectedGrade(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 10,
                    backgroundColor: 'var(--theme-page-bg)',
                    border: '1px solid var(--theme-border)',
                    color: 'var(--theme-navy)',
                    fontSize: '0.86rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                  aria-label="Filter by Grade"
                >
                  <option value="all">{lang === 'KH' ? 'គ្រប់កម្រិតថ្នាក់ (7–12)' : 'All Grades (7–12)'}</option>
                  <option value="7">ថ្នាក់ទី ៧ (Grade 7)</option>
                  <option value="8">ថ្នាក់ទី ៨ (Grade 8)</option>
                  <option value="9">ថ្នាក់ទី ៩ (Grade 9)</option>
                  <option value="10">ថ្នាក់ទី ១០ (Grade 10)</option>
                  <option value="11">ថ្នាក់ទី ១១ (Grade 11)</option>
                  <option value="12">ថ្នាក់ទី ១២ (Grade 12)</option>
                </select>

                {/* Status Filter */}
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 10,
                    backgroundColor: 'var(--theme-page-bg)',
                    border: '1px solid var(--theme-border)',
                    color: 'var(--theme-navy)',
                    fontSize: '0.86rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  <option value="all">{lang === 'KH' ? 'ស្ថានភាពទាំងអស់' : 'All Statuses'}</option>
                  <option value="active">{lang === 'KH' ? 'សកម្ម (Active)' : 'Active'}</option>
                  <option value="expiring_soon">{lang === 'KH' ? 'ជិតផុតកំណត់ (Expiring Soon)' : 'Expiring Soon'}</option>
                  <option value="expired">{lang === 'KH' ? 'ផុតកំណត់ (Expired)' : 'Expired'}</option>
                  <option value="blocked">{lang === 'KH' ? 'បានផ្អាក (Blocked)' : 'Blocked'}</option>
                </select>

                {/* Class / Group Filter */}
                {uniqueClasses.length > 0 && (
                  <select
                    value={selectedClass}
                    onChange={(e) => setSelectedClass(e.target.value)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 10,
                      backgroundColor: 'var(--theme-page-bg)',
                      border: '1px solid var(--theme-border)',
                      color: 'var(--theme-navy)',
                      fontSize: '0.86rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      outline: 'none',
                    }}
                    aria-label="Filter by Class"
                  >
                    <option value="all">{lang === 'KH' ? 'គ្រប់បន្ទប់/ក្រុម (All Classes)' : 'All Classes'}</option>
                    {uniqueClasses.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Copy Student Registration Link */}
              <button
                type="button"
                onClick={() => {
                  const regUrl = `${window.location.origin}/register`;
                  navigator.clipboard.writeText(regUrl);
                  showToast(lang === 'KH' ? 'បានចម្លងតំណចុះឈ្មោះសិស្សថ្មី!' : 'Copied Student Registration Link!');
                }}
                className="btn"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '9px 16px',
                  borderRadius: 12,
                  backgroundColor: 'var(--theme-card-bg)',
                  color: 'var(--theme-navy)',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  border: '1.5px solid var(--theme-border)',
                  cursor: 'pointer',
                }}
                title={lang === 'KH' ? 'ចម្លងតំណផ្ញើជូនសិស្សចុះឈ្មោះ' : 'Copy link to send to students'}
              >
                <Copy size={16} color="var(--theme-primary)" />
                <span>{lang === 'KH' ? 'តំណចុះឈ្មោះសិស្ស' : 'Student Register Link'}</span>
              </button>

              {/* Add Student Button */}
              <button
                type="button"
                onClick={openAddModal}
                className="btn"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '9px 18px',
                  borderRadius: 12,
                  backgroundColor: 'var(--theme-primary)',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '0.92rem',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(37,99,235,0.25)',
                }}
              >
                <Plus size={18} />
                <span>{lang === 'KH' ? '+ បន្ថែមសិស្សថ្មី' : '+ Add Student'}</span>
              </button>
            </div>

            {/* Note banner: Manual Payment & Name-only matching */}
            <div
              style={{
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                borderRadius: 14,
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                fontSize: '0.85rem',
                color: 'var(--theme-navy)',
              }}
            >
              <ShieldAlert size={20} color="var(--theme-primary)" style={{ flexShrink: 0 }} />
              <div>
                <strong>{lang === 'KH' ? 'ប្រព័ន្ធទូទាត់ក្រៅបណ្ដាញ & ការចូលប្រើ ៖' : 'Offline Payment & Access Control:'}</strong>{' '}
                {lang === 'KH'
                  ? 'បន្ទាប់ពីទទួលបានការបង់ប្រាក់ផ្ទាល់ លោកគ្រូអ្នកគ្រូគ្រាន់តែបន្ថែមឈ្មោះ និងកំណត់កាលបរិច្ឆេទផុតកំណត់។ សិស្សមិនចាំបាច់មានគណនី ឬលេខសម្ងាត់ទេ គ្រាន់តែវាយឈ្មោះខ្លួនឯងដើម្បីធ្វើលំហាត់។'
                  : 'After receiving manual payment outside the site, add the student and set an expiration date. Students enter only their name to start exercises.'}
              </div>
            </div>

            {/* Student Table */}
            <div
              style={{
                backgroundColor: 'var(--theme-card-bg)',
                borderRadius: 16,
                border: '1px solid var(--theme-border)',
                overflow: 'hidden',
                boxShadow: 'var(--theme-shadow)',
              }}
            >
              {loadingStudents ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--theme-muted)' }}>
                  <RefreshCw size={24} className="spin" style={{ margin: '0 auto 10px' }} />
                  <p style={{ margin: 0, fontWeight: 700 }}>
                    {lang === 'KH' ? 'កំពុងទាញយកទិន្នន័យសិស្ស…' : 'Loading approved student list…'}
                  </p>
                </div>
              ) : filteredStudents.length === 0 ? (
                <div style={{ padding: 48, textAlign: 'center', color: 'var(--theme-muted)' }}>
                  <Users size={36} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                  <h3 style={{ margin: '0 0 6px 0', fontSize: '1.1rem', color: 'var(--theme-navy)' }}>
                    {lang === 'KH' ? 'មិនមានទិន្នន័យសិស្សទេ' : 'No students found'}
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.85rem' }}>
                    {searchTerm || selectedClass !== 'all' || selectedStatus !== 'all'
                      ? lang === 'KH'
                        ? 'មិនមានសិស្សត្រូវនឹងលក្ខខណ្ឌស្វែងរកនេះទេ។'
                        : 'No students match the selected filters.'
                      : lang === 'KH'
                      ? 'ចុចប៊ូតុង "+ បន្ថែមសិស្សថ្មី" ដើម្បីចាប់ផ្ដើមអនុញ្ញាតសិស្ស។'
                      : 'Click "+ Add Student" to add approved students.'}
                  </p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                    <thead>
                      <tr
                        style={{
                          backgroundColor: 'var(--theme-page-bg)',
                          borderBottom: '1px solid var(--theme-border)',
                          color: 'var(--theme-muted)',
                          fontSize: '0.8rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          fontWeight: 800,
                        }}
                      >
                        <th style={{ padding: '14px 18px' }}>{lang === 'KH' ? 'ឈ្មោះសិស្ស' : 'Student Name'}</th>
                        <th style={{ padding: '14px 18px' }}>{lang === 'KH' ? 'កម្រិតថ្នាក់' : 'Enrolled Grades'}</th>
                        <th style={{ padding: '14px 18px' }}>{lang === 'KH' ? 'កាលបរិច្ឆេទផុតកំណត់' : 'Expiration Date'}</th>
                        <th style={{ padding: '14px 18px' }}>{lang === 'KH' ? 'ស្ថានភាពចូលប្រើ' : 'Access Status'}</th>
                        <th style={{ padding: '14px 18px' }}>{lang === 'KH' ? 'កែប្រែចុងក្រោយ' : 'Last Updated'}</th>
                        <th style={{ padding: '14px 18px', textAlign: 'right' }}>{lang === 'KH' ? 'សកម្មភាព' : 'Actions'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.map((s) => (
                        <tr
                          key={s.id}
                          style={{
                            borderBottom: '1px solid var(--theme-border)',
                            transition: 'background-color 0.1s ease',
                          }}
                        >
                          {/* Student Name & Unique Link */}
                          <td style={{ padding: '14px 18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 800, color: 'var(--theme-navy)', fontSize: '0.95rem' }}>
                                {s.name}
                              </span>
                              {s.className && (
                                <span
                                  style={{
                                    fontSize: '0.74rem',
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: 6,
                                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                    color: 'var(--theme-primary)',
                                    border: '1px solid rgba(59, 130, 246, 0.25)',
                                  }}
                                >
                                  🏷️ {s.className}
                                </span>
                              )}
                              {s.paymentStatus === 'pending' && (
                                <span
                                  style={{
                                    fontSize: '0.72rem',
                                    fontWeight: 800,
                                    padding: '2px 7px',
                                    borderRadius: 6,
                                    backgroundColor: 'rgba(234, 88, 12, 0.12)',
                                    color: '#ea580c',
                                    border: '1px solid rgba(234, 88, 12, 0.3)',
                                  }}
                                >
                                  ⏳ {lang === 'KH' ? 'មិនទាន់បង់ប្រាក់' : 'Unpaid'}
                                </span>
                              )}
                            </div>
                            {/* Student's unique link preview & copy */}
                            {s.studentToken && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                <span
                                  style={{
                                    fontFamily: 'monospace',
                                    fontSize: '0.74rem',
                                    backgroundColor: 'var(--theme-page-bg)',
                                    padding: '2px 6px',
                                    borderRadius: 6,
                                    color: 'var(--theme-primary)',
                                    border: '1px solid var(--theme-border-subtle)',
                                  }}
                                >
                                  /s/{s.studentToken.slice(0, 8)}…
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyStudentInvite(s)}
                                  title={lang === 'KH' ? 'ចម្លងតំណប្រើម្តង (ថ្មីរាល់ពេលចុច)' : 'Copy one-time student link (new each click)'}
                                  style={{
                                    border: 'none',
                                    background: 'none',
                                    padding: '2px 4px',
                                    cursor: 'pointer',
                                    color: 'var(--theme-primary)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    borderRadius: 4,
                                  }}
                                >
                                  <Copy size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenStudentInvite(s)}
                                  title={lang === 'KH' ? 'បើកមើលមជ្ឈមណ្ឌលសិស្ស' : 'Open Student Portal'}
                                  style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'var(--theme-muted)', display: 'inline-flex', alignItems: 'center' }}
                                >
                                  <ExternalLink size={12} />
                                </button>
                                {s.linkLocked && (
                                  <>
                                    <span
                                      title={lang === 'KH' ? 'តំណនេះចាក់សោលើឧបករណ៍ដែលបានបើកដំបូង' : 'Link is locked to the device that opened it first'}
                                      style={{ fontSize: '0.72rem', color: 'var(--theme-muted)' }}
                                    >
                                      🔒
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleUnlockStudentLink(s)}
                                      title={lang === 'KH' ? 'ដោះសោតំណ' : 'Unlock link'}
                                      style={{ border: 'none', background: 'none', padding: '0 2px', cursor: 'pointer', color: 'var(--theme-muted)', fontSize: '0.72rem', textDecoration: 'underline' }}
                                    >
                                      {lang === 'KH' ? 'ដោះសោ' : 'unlock'}
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                            {s.lastActivityAt && (
                              <div style={{ fontSize: '0.74rem', color: 'var(--theme-muted)', marginTop: 2 }}>
                                <span>{lang === 'KH' ? 'សកម្មភាពចុងក្រោយ ៖ ' : 'Last activity: '}</span>
                                {new Date(s.lastActivityAt).toLocaleDateString()}
                              </div>
                            )}
                          </td>

                          {/* Grades */}
                          <td style={{ padding: '14px 18px' }}>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {(Array.isArray(s.grades) && s.grades.length > 0 ? s.grades : [s.grade || 7]).map((g) => (
                                <span
                                  key={g}
                                  style={{
                                    padding: '3px 8px',
                                    borderRadius: 8,
                                    backgroundColor: 'rgba(74, 103, 214, 0.12)',
                                    color: 'var(--brand)',
                                    fontWeight: 800,
                                    fontSize: '0.82rem',
                                    border: '1px solid rgba(74, 103, 214, 0.25)',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {lang === 'KH' ? gradeLabelKh(g, gradeCodes) : gradeLabelEn(g, gradeCodes)}
                                </span>
                              ))}
                            </div>
                          </td>

                          {/* Expiration Date */}
                          <td style={{ padding: '14px 18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: 'var(--theme-navy)' }}>
                              <Calendar size={15} color="var(--theme-muted)" />
                              <span>{s.expirationDate}</span>
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--theme-muted)', marginTop: 2 }}>
                              Asia/Phnom_Penh (23:59:59)
                            </div>
                          </td>

                          {/* Access Status */}
                          <td style={{ padding: '14px 18px' }}>
                            <StatusBadge status={s.status} />
                          </td>

                          {/* Last Updated */}
                          <td style={{ padding: '14px 18px', color: 'var(--theme-muted)', fontSize: '0.84rem' }}>
                            {new Date(s.updatedAt || s.createdAt).toLocaleDateString()}
                          </td>

                          {/* Actions */}
                          <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              {/* View Submissions Button */}
                              <button
                                type="button"
                                onClick={() => handleViewSubmissions(s)}
                                title={lang === 'KH' ? 'មើលប្រវត្តិធ្វើលំហាត់' : 'View Submission History'}
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: 8,
                                  border: '1px solid var(--theme-border)',
                                  backgroundColor: 'var(--theme-page-bg)',
                                  color: 'var(--theme-primary)',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  fontSize: '0.8rem',
                                  fontWeight: 700,
                                }}
                              >
                                <Clock size={14} />
                                <span>{lang === 'KH' ? 'ប្រវត្តិ' : 'History'}</span>
                              </button>

                              {/* Quick Approve / Revoke Payment Button */}
                              <button
                                type="button"
                                disabled={paymentTogglingId === s.id}
                                onClick={() => handleTogglePaymentApproval(s)}
                                title={
                                  s.paymentStatus === 'pending'
                                    ? (lang === 'KH' ? 'ចុចដើម្បីអនុម័តការបង់ប្រាក់ (Approve Payment)' : 'Approve Payment')
                                    : (lang === 'KH' ? 'បានបង់ប្រាក់ហើយ (ចុចដើម្បីប្ដូរទៅរង់ចាំ)' : 'Payment Approved (Click to revoke)')
                                }
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: 8,
                                  border: s.paymentStatus === 'pending' ? '1px solid #ea580c' : '1px solid var(--theme-border)',
                                  backgroundColor: s.paymentStatus === 'pending' ? 'rgba(234, 88, 12, 0.12)' : 'var(--theme-page-bg)',
                                  color: s.paymentStatus === 'pending' ? '#ea580c' : '#059669',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  fontSize: '0.8rem',
                                  fontWeight: 800,
                                }}
                              >
                                {s.paymentStatus === 'pending' ? (
                                  <>
                                    <span>💳</span>
                                    <span>{lang === 'KH' ? 'អនុម័ត' : 'Approve'}</span>
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 size={14} color="#059669" />
                                    <span>{lang === 'KH' ? 'បានបង់' : 'Paid'}</span>
                                  </>
                                )}
                              </button>

                              {/* Extend Button */}
                              <button
                                type="button"
                                onClick={() => setExtendingStudent(s)}
                                title={lang === 'KH' ? 'បន្តការចូលប្រើ' : 'Extend Expiration'}
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: 8,
                                  border: '1px solid var(--theme-border)',
                                  backgroundColor: 'var(--theme-page-bg)',
                                  color: '#059669',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  fontSize: '0.8rem',
                                  fontWeight: 700,
                                }}
                              >
                                <Plus size={14} />
                                <span>{lang === 'KH' ? 'បន្ត' : 'Extend'}</span>
                              </button>

                              {/* Edit Button */}
                              <button
                                type="button"
                                onClick={() => openEditModal(s)}
                                title={lang === 'KH' ? 'កែសម្រួល' : 'Edit Student'}
                                style={{
                                  padding: '6px 8px',
                                  borderRadius: 8,
                                  border: '1px solid var(--theme-border)',
                                  backgroundColor: 'var(--theme-page-bg)',
                                  color: 'var(--theme-navy)',
                                  cursor: 'pointer',
                                }}
                              >
                                <Edit2 size={15} />
                              </button>

                              {/* Block / Activate Button */}
                              <button
                                type="button"
                                onClick={() => setBlockingStudent(s)}
                                title={s.accessEnabled ? (lang === 'KH' ? 'ផ្អាកការចូលប្រើ' : 'Block Access') : (lang === 'KH' ? 'បើកដំណើរការឡើងវិញ' : 'Activate Access')}
                                style={{
                                  padding: '6px 8px',
                                  borderRadius: 8,
                                  border: '1px solid var(--theme-border)',
                                  backgroundColor: 'var(--theme-page-bg)',
                                  color: s.accessEnabled ? '#d97706' : '#059669',
                                  cursor: 'pointer',
                                }}
                              >
                                {s.accessEnabled ? <Ban size={15} /> : <CheckCircle2 size={15} />}
                              </button>

                              {/* Delete Button */}
                              <button
                                type="button"
                                onClick={() => setDeletingStudent(s)}
                                title={lang === 'KH' ? 'លុបសិស្ស' : 'Delete Student'}
                                style={{
                                  padding: '6px 8px',
                                  borderRadius: 8,
                                  border: '1px solid var(--theme-border)',
                                  backgroundColor: 'var(--theme-page-bg)',
                                  color: '#dc2626',
                                  cursor: 'pointer',
                                }}
                              >
                                <Trash2 size={15} />
                              </button>

                              {/* Parent QR Code shortcut */}
                              {s.parentToken && (
                                <button
                                  type="button"
                                  onClick={() => setQrStudent({ name: s.name, className: s.className || '', token: s.parentToken! })}
                                  title={lang === 'KH' ? 'QR មាតាបិតា' : 'Parent QR'}
                                  style={{
                                    padding: '6px 8px',
                                    borderRadius: 8,
                                    border: '1px solid var(--theme-border)',
                                    backgroundColor: 'var(--theme-page-bg)',
                                    color: 'var(--theme-primary)',
                                    cursor: 'pointer',
                                  }}
                                >
                                  <QrCode size={15} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: PARENT TRACKING PROFILES & QR CODES */}
        {/* ========================================================================= */}
        {activeTab === 'parent' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Parent Tracking Header Options */}
            <div
              style={{
                backgroundColor: 'var(--theme-card-bg)',
                borderRadius: 16,
                padding: '16px 18px',
                border: '1px solid var(--theme-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--theme-navy)' }}>
                  {lang === 'KH' ? 'ប្រវត្តិរូបតាមដានសម្រាប់មាតាបិតា' : 'Parent Tracking Profiles'}
                </h3>
                <span style={{ fontSize: '0.82rem', color: 'var(--theme-muted)' }}>
                  {lang === 'KH'
                    ? 'មាតាបិតាអាចមើលលទ្ធផលកូនបានតាមតំណឯកជន និង QR code ដោយមិនបាច់ចុះឈ្មោះ'
                    : 'Private tracking links and QR codes for parents. No login required.'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => setIsPrintMode(true)}
                  style={{ borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Printer size={15} />
                  <span>{lang === 'KH' ? 'បោះពុម្ពសន្លឹក QR' : 'Print QR Sheet'}</span>
                </button>

                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    color: 'var(--theme-navy)',
                    padding: '7px 12px',
                    borderRadius: 10,
                    backgroundColor: 'var(--theme-page-bg)',
                    border: '1px solid var(--theme-border)',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={showClassAverage}
                    onChange={(e) => handleToggleClassAverage(e.target.checked)}
                    style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--theme-primary)' }}
                  />
                  <span>{lang === 'KH' ? 'បង្ហាញមធ្យមភាគថ្នាក់ដល់មាតាបិតា' : 'Show class average to parents'}</span>
                </label>
              </div>
            </div>

            {/* Profiles Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
              {profiles
                .filter((p) => showHiddenProfiles || !p.hidden)
                .map((p) => (
                  <div
                    key={p.id}
                    style={{
                      backgroundColor: 'var(--theme-card-bg)',
                      borderRadius: 14,
                      padding: 16,
                      border: '1px solid var(--theme-border)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--theme-navy)' }}>
                          {p.name}
                        </h4>
                        {p.className && (
                          <span style={{ fontSize: '0.78rem', color: 'var(--theme-muted)' }}>Class: {p.className}</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => setQrStudent({ name: p.name, className: p.className || '', token: p.parentToken })}
                          title="Show QR Code"
                          style={{
                            padding: '6px 8px',
                            borderRadius: 8,
                            border: '1px solid var(--theme-border)',
                            backgroundColor: 'var(--theme-page-bg)',
                            color: 'var(--theme-navy)',
                            cursor: 'pointer',
                          }}
                        >
                          <QrCode size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => copyParentMessage(p)}
                          title="Copy Parent Message"
                          style={{
                            padding: '6px 8px',
                            borderRadius: 8,
                            border: '1px solid var(--theme-border)',
                            backgroundColor: 'var(--theme-page-bg)',
                            color: 'var(--theme-primary)',
                            cursor: 'pointer',
                          }}
                        >
                          <Copy size={15} />
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--theme-muted)' }}>
                      <span>Completed: <strong>{p.completedCount}</strong></span>
                      <span>Avg Score: <strong>{p.averagePercent !== null ? `${p.averagePercent}%` : '—'}</strong></span>
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <a
                        href={getParentLink(p.parentToken)}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          flex: 1,
                          textAlign: 'center',
                          padding: '7px 12px',
                          borderRadius: 8,
                          backgroundColor: 'var(--theme-page-bg)',
                          border: '1px solid var(--theme-border)',
                          color: 'var(--theme-navy)',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          textDecoration: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                        }}
                      >
                        <ExternalLink size={13} />
                        <span>Open Link</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => openMergeModal(p)}
                        style={{
                          padding: '7px 12px',
                          borderRadius: 8,
                          backgroundColor: 'var(--theme-page-bg)',
                          border: '1px solid var(--theme-border)',
                          color: 'var(--theme-muted)',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Rename/Merge
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: ADD STUDENT */}
      {/* ========================================================================= */}
      {showAddModal && (
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
        >
          <div
            style={{
              backgroundColor: 'var(--theme-card-bg)',
              borderRadius: 20,
              maxWidth: 480,
              width: '100%',
              padding: '24px 22px',
              border: '1px solid var(--theme-border)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: 'var(--theme-navy)' }}>
                {lang === 'KH' ? '➕ បន្ថែមសិស្សអនុញ្ញាតថ្មី' : '➕ Add Approved Student'}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}
              >
                <X size={20} color="var(--theme-muted)" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {formError && (
                <div
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#dc2626',
                    padding: '10px 14px',
                    borderRadius: 10,
                    fontSize: '0.86rem',
                    fontWeight: 700,
                  }}
                >
                  {formError}
                </div>
              )}

              {/* Student Name */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 800, color: 'var(--theme-navy)', marginBottom: 6 }}>
                  {lang === 'KH' ? 'ឈ្មោះសិស្ស (Student Name) *' : 'Student Name *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ស៊ុន ដារ៉ា ឬ Sok Dara"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--theme-border)',
                    backgroundColor: 'var(--theme-page-bg)',
                    color: 'var(--theme-navy)',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Multi-Grade Selection (Grades 7–12) */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 800, color: 'var(--theme-navy)', marginBottom: 6 }}>
                  {lang === 'KH'
                    ? 'កម្រិតថ្នាក់ដែលអនុញ្ញាត (Enrolled Grades) *'
                    : 'Enrolled Grades (Student can enroll in 1 or more grades) *'}
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 8 }}>
                  {(customGrades.length > 0 ? customGrades : [7, 8, 9, 10, 11, 12]).map((g) => {
                    const val = gradeCode(g, gradeCodes);
                    const isSelected = val !== null && formGrades.includes(val);
                    const label = isNumericGrade(g) ? `ថ្នាក់ទី ${g}` : String(g);
                    return (
                      <button
                        key={String(g)}
                        type="button"
                        onClick={() => toggleGradeSelection(g)}
                        style={{
                          padding: '10px 8px',
                          borderRadius: 10,
                          border: isSelected ? '2px solid var(--theme-primary)' : '1px solid var(--theme-border)',
                          backgroundColor: isSelected ? 'rgba(74, 103, 214, 0.15)' : 'var(--theme-page-bg)',
                          color: isSelected ? 'var(--theme-primary)' : 'var(--theme-navy)',
                          fontWeight: 800,
                          fontSize: '0.88rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {isSelected && <Check size={14} />}
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--theme-muted)', marginTop: 6 }}>
                  {lang === 'KH'
                    ? '💡 អ្នកអាចជ្រើសរើសបានលើសពី ១ ថ្នាក់ (ឧ. សិស្សម្នាក់អាចរៀនទាំងថ្នាក់ទី ៧ និង ថ្នាក់ទី ៨)'
                    : '💡 You can select multiple grades (e.g. 1 student can enroll in Grade 7 and Grade 8).'}
                </div>
              </div>

              {/* Class / Group Name (e.g. 12A, 12B, Morning, Evening, Olympiad) */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--theme-navy)', margin: 0 }}>
                    {lang === 'KH' ? 'បន្ទប់ ឬឈ្មោះក្រុម / ថ្នាក់ (Class / Group Name)' : 'Class / Group Name (Optional)'}
                  </label>
                  {uniqueClasses.length > 0 && (
                    <select
                      style={{
                        fontSize: '0.75rem',
                        padding: '2px 8px',
                        borderRadius: 6,
                        border: '1px solid var(--theme-border)',
                        backgroundColor: 'var(--theme-card-bg)',
                        color: 'var(--theme-navy)',
                        cursor: 'pointer',
                      }}
                      value=""
                      onChange={(e) => {
                        if (e.target.value) setFormClassName(e.target.value);
                      }}
                    >
                      <option value="">{lang === 'KH' ? '— ជ្រើសរើសបន្ទប់ដែលមាន —' : '— Pick Existing Class —'}</option>
                      {uniqueClasses.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="e.g. 12A, 12B, ក្រុមពេលល្ងាច, Math Olympiad"
                  value={formClassName}
                  onChange={(e) => setFormClassName(e.target.value)}
                  maxLength={50}
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--theme-border)',
                    backgroundColor: 'var(--theme-page-bg)',
                    color: 'var(--theme-navy)',
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Expiration Date */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 800, color: 'var(--theme-navy)', marginBottom: 6 }}>
                  {lang === 'KH' ? 'កាលបរិច្ឆេទផុតកំណត់ (Expiration Date) *' : 'Expiration Date (Cambodia Time) *'}
                </label>
                <input
                  type="date"
                  required
                  value={formExpiration}
                  onChange={(e) => setFormExpiration(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--theme-border)',
                    backgroundColor: 'var(--theme-page-bg)',
                    color: 'var(--theme-navy)',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                {/* Quick Presets */}
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {[
                    { label: '+30 ថ្ងៃ', days: 30 },
                    { label: '+60 ថ្ងៃ', days: 60 },
                    { label: '+90 ថ្ងៃ', days: 90 },
                    { label: '+1 ឆ្នាំ', days: 365 },
                  ].map((p) => (
                    <button
                      key={p.days}
                      type="button"
                      onClick={() => {
                        const d = new Date(Date.now() + 7 * 60 * 60 * 1000 + p.days * 24 * 60 * 60 * 1000);
                        setFormExpiration(d.toISOString().split('T')[0]);
                      }}
                      style={{
                        padding: '4px 8px',
                        borderRadius: 6,
                        border: '1px solid var(--theme-border)',
                        backgroundColor: 'var(--theme-page-bg)',
                        color: 'var(--theme-primary)',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Access Enabled Toggle */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  padding: '8px 10px',
                  borderRadius: 10,
                  backgroundColor: 'var(--theme-page-bg)',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={formAccessEnabled}
                  onChange={(e) => setFormAccessEnabled(e.target.checked)}
                  style={{ width: 17, height: 17, accentColor: 'var(--theme-primary)', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--theme-navy)' }}>
                  {lang === 'KH' ? 'បើកដំណើរការការចូលប្រើ (Access Enabled)' : 'Enable Access Immediately'}
                </span>
              </label>

              {/* Payment Approval Toggle */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  padding: '8px 10px',
                  borderRadius: 10,
                  backgroundColor: formPaymentStatus === 'approved' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(234, 88, 12, 0.08)',
                  border: formPaymentStatus === 'approved' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(234, 88, 12, 0.3)',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={formPaymentStatus === 'approved'}
                  onChange={(e) => setFormPaymentStatus(e.target.checked ? 'approved' : 'pending')}
                  style={{ width: 17, height: 17, accentColor: '#10b981', cursor: 'pointer' }}
                />
                <div>
                  <span style={{ fontSize: '0.88rem', fontWeight: 700, color: formPaymentStatus === 'approved' ? '#059669' : '#ea580c' }}>
                    {formPaymentStatus === 'approved'
                      ? (lang === 'KH' ? '✓ បានអនុម័តការបង់ប្រាក់ (Payment Approved)' : 'Payment Approved — Full Access')
                      : (lang === 'KH' ? '⏳ មិនទាន់បង់ប្រាក់ (Pending Payment — Sample Only)' : 'Pending Payment — Sample Only')}
                  </span>
                  <span style={{ display: 'block', fontSize: '0.74rem', color: 'var(--theme-muted)' }}>
                    {formPaymentStatus === 'approved'
                      ? (lang === 'KH' ? 'សិស្សអាចធ្វើលំហាត់ទាំងអស់បាន' : 'Student can access all published exercises')
                      : (lang === 'KH' ? 'សិស្សអាចធ្វើបានតែលំហាត់សាកល្បងប៉ុណ្ណោះ' : 'Student can only access sample exercises')}
                  </span>
                </div>
              </label>

              {/* Note on Name-only access */}
              <div style={{ fontSize: '0.76rem', color: 'var(--theme-muted)', lineHeight: 1.4 }}>
                ℹ️ {lang === 'KH'
                  ? 'ចំណាំ ៖ ដោយសារសិស្សវាយតែឈ្មោះដើម្បីចូលធ្វើលំហាត់ ប្រសិនបើមានសិស្សឈ្មោះដូចគ្នាក្នុងថ្នាក់ផ្សេងគ្នា សូមណែនាំសិស្សឱ្យបញ្ជាក់ឱ្យច្បាស់។'
                  : 'Note: Because students enter only their name to start, ensure unique spelling if students in different classes share identical names.'}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn secondary"
                  style={{ borderRadius: 10, padding: '9px 16px', fontWeight: 700 }}
                >
                  {lang === 'KH' ? 'បោះបង់' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="btn"
                  style={{
                    borderRadius: 10,
                    padding: '9px 20px',
                    fontWeight: 800,
                    backgroundColor: 'var(--theme-primary)',
                    color: '#ffffff',
                    border: 'none',
                    cursor: formSubmitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {formSubmitting
                    ? lang === 'KH'
                      ? 'កំពុងរក្សាទុក…'
                      : 'Saving…'
                    : lang === 'KH'
                    ? 'រក្សាទុកសិស្ស'
                    : 'Save Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: EDIT STUDENT */}
      {/* ========================================================================= */}
      {editingStudent && (
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
        >
          <div
            style={{
              backgroundColor: 'var(--theme-card-bg)',
              borderRadius: 20,
              maxWidth: 480,
              width: '100%',
              padding: '24px 22px',
              border: '1px solid var(--theme-border)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: 'var(--theme-navy)' }}>
                {lang === 'KH' ? '✏️ កែសម្រួលព័ត៌មានសិស្ស' : '✏️ Edit Student'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}
              >
                <X size={20} color="var(--theme-muted)" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {formError && (
                <div
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#dc2626',
                    padding: '10px 14px',
                    borderRadius: 10,
                    fontSize: '0.86rem',
                    fontWeight: 700,
                  }}
                >
                  {formError}
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 800, color: 'var(--theme-navy)', marginBottom: 6 }}>
                  {lang === 'KH' ? 'ឈ្មោះសិស្ស *' : 'Student Name *'}
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--theme-border)',
                    backgroundColor: 'var(--theme-page-bg)',
                    color: 'var(--theme-navy)',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Multi-Grade Selection (Grades 7–12) */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 800, color: 'var(--theme-navy)', marginBottom: 6 }}>
                  {lang === 'KH'
                    ? 'កម្រិតថ្នាក់ដែលអនុញ្ញាត (Enrolled Grades) *'
                    : 'Enrolled Grades (Student can enroll in 1 or more grades) *'}
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 8 }}>
                  {(customGrades.length > 0 ? customGrades : [7, 8, 9, 10, 11, 12]).map((g) => {
                    const val = gradeCode(g, gradeCodes);
                    const isSelected = val !== null && formGrades.includes(val);
                    const label = isNumericGrade(g) ? `ថ្នាក់ទី ${g}` : String(g);
                    return (
                      <button
                        key={String(g)}
                        type="button"
                        onClick={() => toggleGradeSelection(g)}
                        style={{
                          padding: '10px 8px',
                          borderRadius: 10,
                          border: isSelected ? '2px solid var(--theme-primary)' : '1px solid var(--theme-border)',
                          backgroundColor: isSelected ? 'rgba(74, 103, 214, 0.15)' : 'var(--theme-page-bg)',
                          color: isSelected ? 'var(--theme-primary)' : 'var(--theme-navy)',
                          fontWeight: 800,
                          fontSize: '0.88rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {isSelected && <Check size={14} />}
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--theme-muted)', marginTop: 6 }}>
                  {lang === 'KH'
                    ? '💡 អ្នកអាចជ្រើសរើសបានលើសពី ១ ថ្នាក់ (ឧ. សិស្សម្នាក់អាចរៀនទាំងថ្នាក់ទី ៧ និង ថ្នាក់ទី ៨)'
                    : '💡 You can select multiple grades (e.g. 1 student can enroll in Grade 7 and Grade 8).'}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 800, color: 'var(--theme-navy)', marginBottom: 6 }}>
                  {lang === 'KH' ? 'កាលបរិច្ឆេទផុតកំណត់ *' : 'Expiration Date *'}
                </label>
                <input
                  type="date"
                  required
                  value={formExpiration}
                  onChange={(e) => setFormExpiration(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--theme-border)',
                    backgroundColor: 'var(--theme-page-bg)',
                    color: 'var(--theme-navy)',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  padding: '8px 10px',
                  borderRadius: 10,
                  backgroundColor: 'var(--theme-page-bg)',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={formAccessEnabled}
                  onChange={(e) => setFormAccessEnabled(e.target.checked)}
                  style={{ width: 17, height: 17, accentColor: 'var(--theme-primary)', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--theme-navy)' }}>
                  {lang === 'KH' ? 'បើកដំណើរការការចូលប្រើ (Access Enabled)' : 'Access Enabled'}
                </span>
              </label>

              {/* Payment Approval Toggle */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  padding: '8px 10px',
                  borderRadius: 10,
                  backgroundColor: formPaymentStatus === 'approved' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(234, 88, 12, 0.08)',
                  border: formPaymentStatus === 'approved' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(234, 88, 12, 0.3)',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={formPaymentStatus === 'approved'}
                  onChange={(e) => setFormPaymentStatus(e.target.checked ? 'approved' : 'pending')}
                  style={{ width: 17, height: 17, accentColor: '#10b981', cursor: 'pointer' }}
                />
                <div>
                  <span style={{ fontSize: '0.88rem', fontWeight: 700, color: formPaymentStatus === 'approved' ? '#059669' : '#ea580c' }}>
                    {formPaymentStatus === 'approved'
                      ? (lang === 'KH' ? '✓ បានអនុម័តការបង់ប្រាក់ (Payment Approved)' : 'Payment Approved — Full Access')
                      : (lang === 'KH' ? '⏳ មិនទាន់បង់ប្រាក់ (Pending Payment — Sample Only)' : 'Pending Payment — Sample Only')}
                  </span>
                  <span style={{ display: 'block', fontSize: '0.74rem', color: 'var(--theme-muted)' }}>
                    {formPaymentStatus === 'approved'
                      ? (lang === 'KH' ? 'សិស្សអាចធ្វើលំហាត់ទាំងអស់បាន' : 'Student can access all published exercises')
                      : (lang === 'KH' ? 'សិស្សអាចធ្វើបានតែលំហាត់សាកល្បងប៉ុណ្ណោះ' : 'Student can only access sample exercises')}
                  </span>
                </div>
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="btn secondary"
                  style={{ borderRadius: 10, padding: '9px 16px', fontWeight: 700 }}
                >
                  {lang === 'KH' ? 'បោះបង់' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="btn"
                  style={{
                    borderRadius: 10,
                    padding: '9px 20px',
                    fontWeight: 800,
                    backgroundColor: 'var(--theme-primary)',
                    color: '#ffffff',
                    border: 'none',
                    cursor: formSubmitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {formSubmitting ? 'Saving…' : lang === 'KH' ? 'កែប្រែ' : 'Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: EXTEND ACCESS (+30, +60, +90 days, or custom date) */}
      {/* ========================================================================= */}
      {extendingStudent && (
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
        >
          <div
            style={{
              backgroundColor: 'var(--theme-card-bg)',
              borderRadius: 20,
              maxWidth: 440,
              width: '100%',
              padding: '24px 22px',
              border: '1px solid var(--theme-border)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: 'var(--theme-navy)' }}>
                  {lang === 'KH' ? '📅 បន្តសុពលភាពការចូលប្រើ' : '📅 Extend Student Access'}
                </h3>
                <span style={{ fontSize: '0.82rem', color: 'var(--theme-muted)' }}>
                  {extendingStudent.name} {extendingStudent.className ? `(${extendingStudent.className})` : ''}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setExtendingStudent(null)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}
              >
                <X size={20} color="var(--theme-muted)" />
              </button>
            </div>

            <div style={{ fontSize: '0.85rem', color: 'var(--theme-navy)', marginBottom: 16, backgroundColor: 'var(--theme-page-bg)', padding: '10px 14px', borderRadius: 10 }}>
              <span>{lang === 'KH' ? 'កាលបរិច្ឆេទផុតកំណត់បច្ចុប្បន្ន ៖ ' : 'Current Expiration: '}</span>
              <strong>{extendingStudent.expirationDate}</strong>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--theme-muted)', textTransform: 'uppercase' }}>
                {lang === 'KH' ? 'ជ្រើសរើសរយៈពេលបន្តរហ័ស ៖' : 'Quick Extension Options:'}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: '+30 ថ្ងៃ (+30 Days)', days: 30 },
                  { label: '+60 ថ្ងៃ (+60 Days)', days: 60 },
                  { label: '+90 ថ្ងៃ (+90 Days)', days: 90 },
                  { label: '+1 ឆ្នាំ (+1 Year)', days: 365 },
                ].map((p) => (
                  <button
                    key={p.days}
                    type="button"
                    disabled={extSubmitting}
                    onClick={() => handleExtend(p.days)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 12,
                      border: '1px solid var(--theme-border)',
                      backgroundColor: 'var(--theme-page-bg)',
                      color: 'var(--theme-navy)',
                      fontWeight: 800,
                      fontSize: '0.88rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                    }}
                  >
                    <Plus size={15} color="var(--theme-primary)" />
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>

              {/* Or Select Custom Date */}
              <div style={{ marginTop: 10 }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 800, color: 'var(--theme-muted)', marginBottom: 6 }}>
                  {lang === 'KH' ? 'ឬកំណត់កាលបរិច្ឆេទថ្មីផ្ទាល់ ៖' : 'Or Pick a Specific Date:'}
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="date"
                    value={customExtDate}
                    onChange={(e) => setCustomExtDate(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid var(--theme-border)',
                      backgroundColor: 'var(--theme-page-bg)',
                      color: 'var(--theme-navy)',
                      fontSize: '0.9rem',
                      outline: 'none',
                    }}
                  />
                  <button
                    type="button"
                    disabled={!customExtDate || extSubmitting}
                    onClick={() => handleExtend(0, customExtDate)}
                    style={{
                      padding: '10px 16px',
                      borderRadius: 10,
                      backgroundColor: 'var(--theme-primary)',
                      color: '#ffffff',
                      border: 'none',
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      cursor: !customExtDate || extSubmitting ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {lang === 'KH' ? 'យល់ព្រម' : 'Apply'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: BLOCK / ACTIVATE CONFIRMATION */}
      {/* ========================================================================= */}
      {blockingStudent && (
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
        >
          <div
            style={{
              backgroundColor: 'var(--theme-card-bg)',
              borderRadius: 20,
              maxWidth: 420,
              width: '100%',
              padding: '24px 22px',
              border: '1px solid var(--theme-border)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              {blockingStudent.accessEnabled ? (
                <div style={{ padding: 10, borderRadius: 12, backgroundColor: 'rgba(217, 119, 6, 0.12)', color: '#d97706' }}>
                  <Ban size={24} />
                </div>
              ) : (
                <div style={{ padding: 10, borderRadius: 12, backgroundColor: 'rgba(5, 150, 105, 0.12)', color: '#059669' }}>
                  <CheckCircle2 size={24} />
                </div>
              )}
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: 'var(--theme-navy)' }}>
                  {blockingStudent.accessEnabled
                    ? lang === 'KH'
                      ? 'ផ្អាកការចូលប្រើ?'
                      : 'Pause Access?'
                    : lang === 'KH'
                    ? 'បើកការចូលប្រើឡើងវិញ?'
                    : 'Re-activate Access?'}
                </h3>
                <span style={{ fontSize: '0.82rem', color: 'var(--theme-muted)' }}>
                  {blockingStudent.name}
                </span>
              </div>
            </div>

            <p style={{ fontSize: '0.88rem', color: 'var(--theme-navy)', lineHeight: 1.5, margin: '0 0 20px 0' }}>
              {blockingStudent.accessEnabled
                ? lang === 'KH'
                  ? `សិស្ស "${blockingStudent.name}" នឹងមិនអាចចាប់ផ្ដើមធ្វើលំហាត់ថ្មីៗបានទៀតទេ រហូតដល់លោកគ្រូអ្នកគ្រូបើកដំណើរការឡើងវិញ។`
                  : `Student "${blockingStudent.name}" will immediately be prevented from starting any new exercises until reactivated.`
                : lang === 'KH'
                ? `សិស្ស "${blockingStudent.name}" នឹងអាចចូលធ្វើលំហាត់បានធម្មតាឡើងវិញ (រហូតដល់ផុតកំណត់ ${blockingStudent.expirationDate})។`
                : `Student "${blockingStudent.name}" will regain access to take exercises (valid until ${blockingStudent.expirationDate}).`}
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setBlockingStudent(null)}
                className="btn secondary"
                style={{ borderRadius: 10, padding: '9px 16px', fontWeight: 700 }}
              >
                {lang === 'KH' ? 'បោះបង់' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleToggleBlock}
                className="btn"
                style={{
                  borderRadius: 10,
                  padding: '9px 20px',
                  fontWeight: 800,
                  backgroundColor: blockingStudent.accessEnabled ? '#d97706' : '#059669',
                  color: '#ffffff',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {blockingStudent.accessEnabled
                  ? lang === 'KH'
                    ? 'ផ្អាកការចូលប្រើ'
                    : 'Pause Access'
                  : lang === 'KH'
                  ? 'បើកដំណើរការ'
                  : 'Re-activate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: DELETE CONFIRMATION */}
      {/* ========================================================================= */}
      {deletingStudent && (
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
        >
          <div
            style={{
              backgroundColor: 'var(--theme-card-bg)',
              borderRadius: 20,
              maxWidth: 440,
              width: '100%',
              padding: '24px 22px',
              border: '1px solid var(--theme-border)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ padding: 10, borderRadius: 12, backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#dc2626' }}>
                <Trash2 size={24} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: 'var(--theme-navy)' }}>
                  {lang === 'KH' ? 'លុបសិស្សនេះ?' : 'Delete Student?'}
                </h3>
                <span style={{ fontSize: '0.82rem', color: 'var(--theme-muted)' }}>
                  {deletingStudent.name}
                </span>
              </div>
            </div>

            <div
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: 12,
                padding: '12px 14px',
                marginBottom: 16,
              }}
            >
              <p style={{ margin: 0, fontSize: '0.86rem', color: '#b91c1c', lineHeight: 1.45 }}>
                {lang === 'KH'
                  ? '⚠️ ការលុបសិស្សនេះ គ្រាន់តែដកសិទ្ធិចូលធ្វើលំហាត់ប៉ុណ្ណោះ។ រាល់លទ្ធផលប្រឡងចាស់ៗ និងតំណតាមដានរបស់មាតាបិតា នឹងមិនត្រូវបានលុបបាត់ឡើយ!'
                  : '⚠️ Deleting only removes exercise access authorization. Historical exercise submissions and parent tracking results will strictly be preserved.'}
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setDeletingStudent(null)}
                className="btn secondary"
                style={{ borderRadius: 10, padding: '9px 16px', fontWeight: 700 }}
              >
                {lang === 'KH' ? 'បោះបង់' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleDeleteStudent}
                className="btn"
                style={{
                  borderRadius: 10,
                  padding: '9px 20px',
                  fontWeight: 800,
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {lang === 'KH' ? 'លុបសិស្ស' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 6: PARENT QR CODE POPUP */}
      {/* ========================================================================= */}
      {qrStudent && (
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
          onClick={() => setQrStudent(null)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 24,
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
              {qrStudent.name}
            </h3>
            {qrStudent.className && (
              <span style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 16 }}>
                Class: {qrStudent.className}
              </span>
            )}

            <div style={{ padding: 14, backgroundColor: '#f8fafc', borderRadius: 16, border: '1px solid #e2e8f0', marginBottom: 16 }}>
              <QRCodeSVG value={getParentLink(qrStudent.token)} size={200} />
            </div>

            <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#16a34a', marginBottom: 4 }}>
              📱 Parent Tracking QR Code
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: 20 }}>
              មាតាបិតាស្កេនដើម្បីមើលលទ្ធផល / Scan to view child results
            </div>

            <div style={{ display: 'flex', gap: 10, width: '100%' }}>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(getParentLink(qrStudent.token));
                  showToast('Parent link copied to clipboard!');
                }}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: 12,
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <Copy size={15} />
                <span>Copy Link</span>
              </button>
              <button
                type="button"
                onClick={() => setQrStudent(null)}
                style={{
                  padding: '10px 18px',
                  borderRadius: 12,
                  backgroundColor: '#f1f5f9',
                  color: '#475569',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 7: RENAME / MERGE PARENT PROFILES */}
      {/* ========================================================================= */}
      {mergeModalProfile && (
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
        >
          <div
            style={{
              backgroundColor: 'var(--theme-card-bg)',
              borderRadius: 20,
              maxWidth: 480,
              width: '100%',
              padding: '24px 22px',
              border: '1px solid var(--theme-border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: 'var(--theme-navy)' }}>
                {mergeMode === 'rename' ? 'Rename Profile' : 'Merge Submissions'}
              </h3>
              <button
                type="button"
                onClick={() => setMergeModalProfile(null)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}
              >
                <X size={20} color="var(--theme-muted)" />
              </button>
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              <button
                type="button"
                onClick={() => setMergeMode('rename')}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: mergeMode === 'rename' ? 'var(--theme-primary)' : 'var(--theme-page-bg)',
                  color: mergeMode === 'rename' ? '#fff' : 'var(--theme-navy)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Rename
              </button>
              <button
                type="button"
                onClick={() => setMergeMode('merge')}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: mergeMode === 'merge' ? 'var(--theme-primary)' : 'var(--theme-page-bg)',
                  color: mergeMode === 'merge' ? '#fff' : 'var(--theme-navy)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Merge Into Another
              </button>
            </div>

            <form onSubmit={handleMergeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {mergeMode === 'rename' ? (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 800, marginBottom: 4 }}>
                      Student Name
                    </label>
                    <input
                      type="text"
                      required
                      value={renameName}
                      onChange={(e) => setRenameName(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: '1px solid var(--theme-border)',
                        backgroundColor: 'var(--theme-page-bg)',
                        color: 'var(--theme-navy)',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 800, marginBottom: 4 }}>
                      Class (Optional)
                    </label>
                    <input
                      type="text"
                      value={renameClass}
                      onChange={(e) => setRenameClass(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: '1px solid var(--theme-border)',
                        backgroundColor: 'var(--theme-page-bg)',
                        color: 'var(--theme-navy)',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 800, marginBottom: 4 }}>
                    Select Target Student
                  </label>
                  <select
                    value={targetMergeId}
                    onChange={(e) => setTargetMergeId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid var(--theme-border)',
                      backgroundColor: 'var(--theme-page-bg)',
                      color: 'var(--theme-navy)',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="">-- Choose student --</option>
                    {profiles
                      .filter((p) => p.id !== mergeModalProfile.id)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.className ? `(${p.className})` : ''}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => setMergeModalProfile(null)}
                  className="btn secondary"
                  style={{ borderRadius: 10, padding: '8px 14px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={mergeBusy}
                  className="btn"
                  style={{
                    borderRadius: 10,
                    padding: '8px 18px',
                    fontWeight: 800,
                    backgroundColor: 'var(--theme-primary)',
                    color: '#fff',
                    border: 'none',
                  }}
                >
                  {mergeBusy ? 'Processing…' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 6: STUDENT SUBMISSION HISTORY */}
      {/* ========================================================================= */}
      {historyStudent && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(3px)',
            zIndex: 999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--theme-card-bg)',
              borderRadius: 20,
              maxWidth: 680,
              width: '100%',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              padding: '24px 22px',
              border: '1px solid var(--theme-border)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: 'var(--theme-navy)' }}>
                  {lang === 'KH' ? `📜 ប្រវត្តិធ្វើលំហាត់ ៖ ${historyStudent.name}` : `📜 Submission History: ${historyStudent.name}`}
                </h3>
                <span style={{ fontSize: '0.82rem', color: 'var(--theme-muted)' }}>
                  {gradeLabelKh(historyStudent.grade || 7, gradeCodes)} {historyStudent.className ? `(Class ${historyStudent.className})` : ''} · ចូលប្រើបានរហូតដល់ {historyStudent.expirationDate}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setHistoryStudent(null)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}
              >
                <X size={20} color="var(--theme-muted)" />
              </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 }}>
              {loadingSubmissions ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--theme-muted)' }}>
                  <RefreshCw size={24} className="spin" style={{ margin: '0 auto 10px' }} />
                  <p style={{ margin: 0, fontWeight: 700 }}>
                    {lang === 'KH' ? 'កំពុងទាញយកប្រវត្តិលំហាត់…' : 'Loading submissions…'}
                  </p>
                </div>
              ) : studentSubmissions.length === 0 ? (
                <div style={{ padding: 36, textAlign: 'center', color: 'var(--theme-muted)', backgroundColor: 'var(--theme-page-bg)', borderRadius: 12 }}>
                  <Clock size={32} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                  <p style={{ margin: 0, fontWeight: 700 }}>
                    {lang === 'KH' ? 'សិស្សនេះមិនទាន់មានប្រវត្តិធ្វើលំហាត់នៅឡើយទេ។' : 'No submissions recorded for this student yet.'}
                  </p>
                </div>
              ) : (
                studentSubmissions.map((sub: any) => {
                  const pct = sub.total > 0 ? Math.round((sub.score / sub.total) * 100) : 0;
                  const dateStr = sub.submittedAt
                    ? new Date(sub.submittedAt).toLocaleDateString('km-KH', { timeZone: 'Asia/Phnom_Penh', year: 'numeric', month: 'short', day: 'numeric' })
                    : sub.startedAt
                    ? new Date(sub.startedAt).toLocaleDateString('km-KH', { timeZone: 'Asia/Phnom_Penh', year: 'numeric', month: 'short', day: 'numeric' })
                    : '—';
                  const timeStr = sub.submittedAt
                    ? new Date(sub.submittedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Phnom_Penh' })
                    : '';

                  return (
                    <div
                      key={sub.id}
                      style={{
                        padding: '12px 16px',
                        borderRadius: 12,
                        backgroundColor: 'var(--theme-page-bg)',
                        border: '1px solid var(--theme-border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 10,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--theme-navy)' }}>
                          {sub.exerciseTitle || `Exercise ${sub.exerciseId}`}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--theme-muted)', marginTop: 2, display: 'flex', gap: 10, alignItems: 'center' }}>
                          <span>📅 {dateStr} {timeStr}</span>
                          {sub.late && (
                            <span style={{ color: '#dc2626', fontWeight: 700, backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '1px 6px', borderRadius: 4 }}>
                              យឺតពេល (Late)
                            </span>
                          )}
                          {sub.status === 'started' && (
                            <span style={{ color: '#d97706', fontWeight: 700, backgroundColor: 'rgba(217, 119, 6, 0.1)', padding: '1px 6px', borderRadius: 4 }}>
                              មិនទាន់បញ្ជូន (In Progress)
                            </span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {sub.status === 'submitted' ? (
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 900, fontSize: '1.1rem', color: pct >= 80 ? '#059669' : pct >= 50 ? 'var(--brand)' : '#dc2626' }}>
                              {sub.score} / {sub.total}
                            </div>
                            <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--theme-muted)' }}>
                              {pct}%
                            </span>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.82rem', color: 'var(--theme-muted)' }}>—</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                type="button"
                onClick={() => setHistoryStudent(null)}
                className="btn secondary"
                style={{ borderRadius: 10, padding: '8px 18px', fontWeight: 700 }}
              >
                {lang === 'KH' ? 'បិទ' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
