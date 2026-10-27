'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { addDoc, collection, doc, getDoc, setDoc } from 'firebase/firestore';
import { Moon, Sun, Copy, Check, Sparkles } from 'lucide-react';
import { getDb } from '@/lib/firebaseClient';
import { useAdmin } from '@/lib/useAdmin';
import MathText from '@/components/MathText';
import type { Exercise, Question } from '@/lib/types';
import { parseExerciseInput } from '@/lib/parseQuestions';
import { CAMBODIAN_MATH_CURRICULUM } from '@/lib/curriculum';

const SAMPLE_AI_PROMPT = `Create a mathematics exercise for Grade [GRADE] about [TOPIC] with [NUMBER] questions. Write in Khmer. Mix easy, medium, and slightly advanced questions: 40% easy, 40% medium, and 20% advanced. Create age-appropriate questions with correct answers, point values, and clear step-by-step explanations so students can understand their mistakes when they answer incorrectly. Include a suitable Khmer exercise title and a short Khmer description. Use valid LaTeX for mathematical formulas. Return ONLY valid JSON compatible with my website's existing exercise schema, including title, description, and questions. Each question must contain id, prompt, kind, answer, points, and explanation. For multiple-choice questions, include choices and ensure the correct answer matches one choice exactly. Do not include Markdown fences or extra text outside the JSON.`;

const newId = () => Math.random().toString(36).slice(2, 10);

const blankQuestion = (): Question => ({
  id: newId(),
  prompt: '',
  kind: 'number',
  answer: '',
  points: 1,
  explanation: '',
});

const blankExercise = (): Exercise => ({
  title: '',
  description: '',
  chapter: '',
  topic: '',
  timeLimitMinutes: 0,
  deadline: null,
  published: false,
  oneAttemptPerName: false,
  shuffleQuestions: false,
  gradeLevels: [7, 8, 9, 10, 11, 12],
  publicationMode: 'instant',
  scheduledPublishAt: null,
  timezone: 'Asia/Phnom_Penh',
  questions: [blankQuestion()],
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

// ISO <-> value for <input type="datetime-local"> (local time)
function toLocalInput(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Converts Khmer digits ០-៩ and fullwidth digits to ASCII 0-9
function toAsciiDigits(str: string): string {
  return str
    .replace(/[\u17e0-\u17e9]/g, (ch) => String(ch.charCodeAt(0) - 0x17e0))
    .replace(/[\uff10-\uff19]/g, (ch) => String(ch.charCodeAt(0) - 0xff10));
}

export default function EditExercise() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin, loading, user } = useAdmin();
  const [ex, setEx] = useState<Exercise | null>(id === 'new' ? blankExercise() : null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // AI Prompt & Paste-import panel
  const [pasteText, setPasteText] = useState('');
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const [viewMode, setViewMode] = useState<'published' | 'edit'>('published');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('theme') as 'light' | 'dark' | null;
      const isDark = saved === 'dark' || (!saved && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
      const activeTheme = isDark ? 'dark' : 'light';
      setTheme(activeTheme);
      document.documentElement.setAttribute('data-theme', activeTheme);
    } catch {}
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    try {
      localStorage.setItem('theme', next);
    } catch {}
    document.documentElement.setAttribute('data-theme', next);
  };

  useEffect(() => {
    if (!isAdmin) return;
    if (id === 'new') {
      if (typeof window !== 'undefined') {
        const p = new URLSearchParams(window.location.search);
        const gParam = p.get('grade');
        const chParam = p.get('chapter');
        const tpParam = p.get('topic');
        setEx((prev) => {
          if (!prev) return prev;
          let gradeLevels = prev.gradeLevels;
          if (gParam) {
            const gNum = Number(gParam);
            if (gNum >= 7 && gNum <= 12) gradeLevels = [gNum];
          }
          return {
            ...prev,
            gradeLevels,
            chapter: chParam || prev.chapter || '',
            topic: tpParam || prev.topic || '',
          };
        });
      }
      return;
    }
    getDoc(doc(getDb(), 'exercises', id))
      .then((s) => (s.exists() ? setEx(s.data() as Exercise) : setError('Exercise not found.')))
      .catch((e) => setError(e.message));
  }, [isAdmin, id]);

  if (loading) return <div className="wrap muted">Loading…</div>;
  if (!user || !isAdmin)
    return (
      <div className="wrap">
        <Link href="/admin">Please sign in as the teacher</Link>
      </div>
    );
  if (error && !ex) return <div className="wrap error">{error}</div>;
  if (!ex) return <div className="wrap muted">Loading…</div>;

  const set = (patch: Partial<Exercise>) => setEx({ ...ex, ...patch });
  // Editing a question counts as reviewing it, so clear the AI "check me" flag.
  const setQ = (i: number, patch: Partial<Question>) =>
    set({
      questions: ex.questions.map((q, j) => (j === i ? { ...q, ...patch, aiGenerated: false } : q)),
    });
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= ex.questions.length) return;
    const qs = [...ex.questions];
    [qs[i], qs[j]] = [qs[j], qs[i]];
    set({ questions: qs });
  };

  function handleTimeChange(raw: string) {
    const ascii = toAsciiDigits(raw);
    const cleaned = ascii.replace(/[^\d]/g, '');
    set({ timeLimitMinutes: cleaned as any });
  }

  function handleTimeBlur() {
    if (!ex) return;
    const str = String(ex.timeLimitMinutes ?? '').trim();
    if (str === '') {
      set({ timeLimitMinutes: 0 });
    } else {
      set({ timeLimitMinutes: Math.max(0, parseInt(str, 10) || 0) });
    }
  }

  function changeKind(i: number, kind: Question['kind']) {
    if (kind === 'choice') {
      setQ(i, { kind, choices: ['', '', '', ''], answer: '0' });
    } else {
      setQ(i, { kind, choices: undefined, answer: '' });
    }
  }

  function setChoice(i: number, c: number, value: string) {
    const q = ex!.questions[i];
    const choices = [...(q.choices ?? [])];
    choices[c] = value;
    setQ(i, { choices });
  }
  function addChoice(i: number) {
    const q = ex!.questions[i];
    if ((q.choices?.length ?? 0) >= 6) return;
    setQ(i, { choices: [...(q.choices ?? []), ''] });
  }
  function removeChoice(i: number, c: number) {
    const q = ex!.questions[i];
    const choices = (q.choices ?? []).filter((_, k) => k !== c);
    if (choices.length < 2) return;
    let ans = Number(q.answer);
    if (c === ans) ans = 0;
    else if (c < ans) ans -= 1;
    setQ(i, { choices, answer: String(ans) });
  }

  const copyPrompt = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(SAMPLE_AI_PROMPT);
      } else {
        const ta = document.createElement('textarea');
        ta.value = SAMPLE_AI_PROMPT;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    } catch {
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    }
  };

  function importExerciseJson() {
    setImportError('');
    setImportSuccess('');

    const raw = pasteText.trim();
    if (!raw) {
      setImportError('Please paste JSON into the box first.');
      return;
    }

    const parsed = parseExerciseInput(raw);
    const qs = parsed.questions;
    if (!qs || qs.length === 0) {
      setImportError('Invalid JSON format: Could not find valid questions. Please ensure your JSON includes a "questions" array with questions.');
      return;
    }

    const patch: Partial<Exercise> = {
      questions: qs,
    };

    if (parsed.title) {
      patch.title = parsed.title;
    }
    if (parsed.description) {
      patch.description = parsed.description;
    }
    if (parsed.timeLimitMinutes !== undefined && parsed.timeLimitMinutes > 0) {
      patch.timeLimitMinutes = parsed.timeLimitMinutes;
    }
    if (parsed.shuffleQuestions !== undefined) {
      patch.shuffleQuestions = parsed.shuffleQuestions;
    }

    set(patch);
    setViewMode('published');

    let msg = `✓ Successfully imported ${qs.length} question${qs.length === 1 ? '' : 's'}`;
    if (parsed.title) msg += ` with title "${parsed.title}"`;
    msg += `! You can now preview and edit all questions below before saving.`;
    setImportSuccess(msg);
  }

  async function save(publish?: boolean) {
    if (!ex) return;
    setError('');
    if (!ex.title.trim()) return setError('Please add a title.');
    if (ex.questions.length === 0) return setError('Add at least one question.');
    for (const [i, q] of ex.questions.entries()) {
      if (!q.prompt.trim()) return setError(`Question ${i + 1} has no text.`);
      if (q.kind === 'choice') {
        const cs = q.choices ?? [];
        if (cs.length < 2 || cs.some((c) => !c.trim())) return setError(`Question ${i + 1}: fill in every choice.`);
      } else if (!q.answer.trim()) {
        return setError(`Question ${i + 1} has no correct answer.`);
      }
    }
    if (publish && ex.questions.some((q) => q.aiGenerated)) {
      if (!confirm('Some AI-generated questions have not been reviewed (marked "Check answer"). Publish anyway?')) return;
    }
    setSaving(true);
    try {
      const isDraft = ex.publicationMode === 'draft';
      const willPublish = publish !== undefined ? publish : (isDraft ? false : ex.published);
      const finalPubMode = !willPublish ? 'draft' : (ex.publicationMode || 'instant');

      const data: Exercise = {
        ...ex,
        gradeLevels: ex.gradeLevels && ex.gradeLevels.length > 0 ? ex.gradeLevels : [7, 8, 9, 10, 11, 12],
        publicationMode: finalPubMode,
        scheduledPublishAt: finalPubMode === 'scheduled' ? ex.scheduledPublishAt : null,
        timezone: 'Asia/Phnom_Penh',
        published: willPublish,
        timeLimitMinutes: Math.max(0, Number(ex.timeLimitMinutes) || 0),
        questions: ex.questions.map((q) => {
          const { choices, ...rest } = q;
          return {
            ...rest,
            ...(q.kind === 'choice' ? { choices } : {}),
            points: Math.max(0, Number(q.points) || 0),
          };
        }),
        updatedAt: Date.now(),
      };
      if (id === 'new') {
        const ref = await addDoc(collection(getDb(), 'exercises'), data);
        router.replace(`/admin/exercises/${ref.id}`);
        setEx(data);
      } else {
        await setDoc(doc(getDb(), 'exercises', id), data);
        setEx(data);
      }
    } catch (e: any) {
      setError(e?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  const total = ex.questions.reduce((s, q) => s + (Number(q.points) || 0), 0);

  return (
    <div className="wrap stack">
      <div className="row spread" style={{ alignItems: 'center' }}>
        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          <img src="/logo.png" alt="Math Logo" style={{ height: 28, width: 'auto', objectFit: 'contain' }} />
          <Link href="/admin">← All exercises</Link>
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            onClick={toggleTheme}
            className="btn secondary small"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px' }}
            title="Toggle Theme"
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>
          {(() => {
            const isScheduled = ex.published && ex.publicationMode === 'scheduled' && ex.scheduledPublishAt && new Date(ex.scheduledPublishAt).getTime() > Date.now();
            if (isScheduled) return <span className="badge info" style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#2563eb' }}>⏰ Scheduled</span>;
            if (ex.published) return <span className="badge live">Published</span>;
            return <span className="badge warn">Draft</span>;
          })()}
        </div>
      </div>

      <div className="card stack">
        <h1>{id === 'new' ? 'New exercise' : 'Edit exercise'}</h1>
        <div>
          <label>ចំណងជើងលំហាត់ (Title)</label>
          <input value={ex.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. លំហាត់ប្រភាគ និងសមីការ" />
        </div>
        <div>
          <label>សេចក្ដីណែនាំសង្ខេប (Description - Optional)</label>
          <textarea
            value={ex.description || ''}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="ការណែនាំដល់សិស្សមុនពេលចាប់ផ្ដើម..."
            rows={2}
          />
        </div>

        {/* Chapter & Topic */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label style={{ margin: 0 }}>ជំពូក (Chapter - Optional)</label>
              {(() => {
                // If single grade is selected or target grade exists, provide quick suggestions
                const targetGrade = (ex.gradeLevels && ex.gradeLevels.length === 1) ? ex.gradeLevels[0] : (ex.gradeLevels?.[0] || 7);
                const curChapters = CAMBODIAN_MATH_CURRICULUM[targetGrade] || [];
                if (curChapters.length === 0) return null;
                return (
                  <select
                    style={{ fontSize: '0.72rem', padding: '2px 6px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--card)' }}
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        set({ chapter: e.target.value });
                      }
                    }}
                  >
                    <option value="">ជ្រើសពីកម្មវិធីសិក្សា (ថ្នាក់ទី {targetGrade})...</option>
                    {curChapters.map((c) => (
                      <option key={c.id} value={c.titleKh}>{c.titleKh}</option>
                    ))}
                  </select>
                );
              })()}
            </div>
            <input
              value={ex.chapter || ''}
              onChange={(e) => set({ chapter: e.target.value })}
              placeholder="e.g. ជំពូកទី ១ ៖ ចំនួនគត់ ឬពិជគណិត"
            />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label style={{ margin: 0 }}>មេរៀន / ប្រធានបទ (Lesson / Topic - Optional)</label>
              {(() => {
                const targetGrade = (ex.gradeLevels && ex.gradeLevels.length === 1) ? ex.gradeLevels[0] : (ex.gradeLevels?.[0] || 7);
                const curChapters = CAMBODIAN_MATH_CURRICULUM[targetGrade] || [];
                const matchedChapter = curChapters.find((c) => c.titleKh === ex.chapter);
                const lessons = matchedChapter ? matchedChapter.lessons : curChapters.flatMap((c) => c.lessons);
                if (lessons.length === 0) return null;
                return (
                  <select
                    style={{ fontSize: '0.72rem', padding: '2px 6px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--card)' }}
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        set({ topic: e.target.value });
                      }
                    }}
                  >
                    <option value="">ជ្រើសមេរៀន...</option>
                    {lessons.map((l) => (
                      <option key={l.id} value={l.titleKh}>{l.titleKh}</option>
                    ))}
                  </select>
                );
              })()}
            </div>
            <input
              value={ex.topic || ''}
              onChange={(e) => set({ topic: e.target.value })}
              placeholder="e.g. មេរៀនទី ២ ៖ ប្រភាគ ឬសមីការដឺក្រេទី១"
            />
          </div>
        </div>

        {/* Target Grades (7-12) */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ margin: 0, fontWeight: 700 }}>
              កម្រិតថ្នាក់គោលដៅ (Target Grades 7–12)
            </label>
            <button
              type="button"
              className="btn secondary small"
              style={{ fontSize: '0.78rem', padding: '3px 8px' }}
              onClick={() => {
                const current = ex.gradeLevels || [];
                if (current.length === 6) {
                  set({ gradeLevels: [7] });
                } else {
                  set({ gradeLevels: [7, 8, 9, 10, 11, 12] });
                }
              }}
            >
              {(ex.gradeLevels?.length ?? 6) === 6 ? 'ជ្រើសរើសថ្នាក់តែមួយ' : 'គ្រប់កម្រិតថ្នាក់ (7–12)'}
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[7, 8, 9, 10, 11, 12].map((g) => {
              const selected = (ex.gradeLevels && ex.gradeLevels.length > 0) ? ex.gradeLevels.includes(g) : true;
              return (
                <label
                  key={g}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: selected ? '1.5px solid var(--brand)' : '1px solid var(--line)',
                    background: selected ? 'rgba(74, 103, 214, 0.12)' : 'var(--card)',
                    color: selected ? 'var(--brand)' : 'var(--ink)',
                    fontWeight: selected ? 700 : 500,
                    cursor: 'pointer',
                    fontSize: '0.88rem',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(e) => {
                      const current = ex.gradeLevels && ex.gradeLevels.length > 0 ? [...ex.gradeLevels] : [7, 8, 9, 10, 11, 12];
                      if (e.target.checked) {
                        if (!current.includes(g)) current.push(g);
                      } else {
                        const idx = current.indexOf(g);
                        if (idx >= 0 && current.length > 1) current.splice(idx, 1);
                      }
                      set({ gradeLevels: current.sort((a, b) => a - b) });
                    }}
                    style={{ accentColor: 'var(--brand)' }}
                  />
                  <span>ថ្នាក់ទី {g} (Grade {g})</span>
                </label>
              );
            })}
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 4, display: 'block' }}>
            មានតែសិស្សក្នុងកម្រិតថ្នាក់ដែលបានជ្រើសរើសប៉ុណ្ណោះ ទើបអាចមើលឃើញ និងធ្វើលំហាត់នេះក្នុង Student Portal
          </span>
        </div>

        {/* Publication Mode & Auto-scheduling in Asia/Phnom_Penh */}
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <label style={{ fontWeight: 700, marginBottom: 8, display: 'block' }}>
            ស្ថានភាពផ្សាយ &amp; កាលវិភាគ (Publication &amp; Scheduling)
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 12 }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: '10px 12px',
                borderRadius: 8,
                border: (ex.publicationMode || 'instant') === 'instant' ? '1.5px solid var(--brand)' : '1px solid var(--line)',
                background: (ex.publicationMode || 'instant') === 'instant' ? 'rgba(74, 103, 214, 0.12)' : 'var(--card)',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="publicationMode"
                value="instant"
                checked={(ex.publicationMode || 'instant') === 'instant'}
                onChange={() => set({ publicationMode: 'instant', scheduledPublishAt: null })}
                style={{ marginTop: 2, accentColor: 'var(--brand)' }}
              />
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>ផ្សាយភ្លាមៗ (Instant)</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                  សិស្សអាចធ្វើបានភ្លាមៗពេលចុច Save &amp; Publish
                </div>
              </div>
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: '10px 12px',
                borderRadius: 8,
                border: ex.publicationMode === 'scheduled' ? '1.5px solid var(--brand)' : '1px solid var(--line)',
                background: ex.publicationMode === 'scheduled' ? 'rgba(74, 103, 214, 0.12)' : 'var(--card)',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="publicationMode"
                value="scheduled"
                checked={ex.publicationMode === 'scheduled'}
                onChange={() => {
                  const now = new Date();
                  now.setHours(now.getHours() + 1, 0, 0, 0);
                  set({
                    publicationMode: 'scheduled',
                    scheduledPublishAt: ex.scheduledPublishAt || now.toISOString(),
                    timezone: 'Asia/Phnom_Penh',
                  });
                }}
                style={{ marginTop: 2, accentColor: 'var(--brand)' }}
              />
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>កំណត់ពេលផ្សាយស្វ័យប្រវត្តិ (Schedule)</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                  ផ្សាយស្វ័យប្រវត្តិតាមម៉ោងកំណត់ (Asia/Phnom_Penh)
                </div>
              </div>
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: '10px 12px',
                borderRadius: 8,
                border: ex.publicationMode === 'draft' ? '1.5px solid var(--brand)' : '1px solid var(--line)',
                background: ex.publicationMode === 'draft' ? 'rgba(74, 103, 214, 0.12)' : 'var(--card)',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="publicationMode"
                value="draft"
                checked={ex.publicationMode === 'draft'}
                onChange={() => set({ publicationMode: 'draft', published: false })}
                style={{ marginTop: 2, accentColor: 'var(--brand)' }}
              />
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>សេចក្ដីព្រាង (Draft)</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                  រក្សាទុកតែក្នុង admin, សិស្សមិនទាន់មើលឃើញ
                </div>
              </div>
            </label>
          </div>

          {ex.publicationMode === 'scheduled' && (
            <div style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--card)', border: '1px solid var(--line)', marginBottom: 10 }}>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
                កាលបរិច្ឆេទ &amp; ម៉ោងផ្សាយស្វ័យប្រវត្តិ (Auto-Publish Date &amp; Time - Asia/Phnom_Penh)
              </label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="datetime-local"
                  value={toLocalInput(typeof ex.scheduledPublishAt === 'string' ? ex.scheduledPublishAt : ex.scheduledPublishAt ? new Date(ex.scheduledPublishAt).toISOString() : null)}
                  onChange={(e) => set({ scheduledPublishAt: e.target.value ? new Date(e.target.value).toISOString() : null, timezone: 'Asia/Phnom_Penh' })}
                  style={{ maxWidth: 280 }}
                />
                <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                  🇰🇭 ម៉ោងនៅកម្ពុជា (UTC+7)
                </span>
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 4, display: 'block' }}>
                លំហាត់នឹងបង្ហាញស្វ័យប្រវត្តិទៅសិស្សនៅពេលដល់ម៉ោងនេះ ដោយមិនចាំបាច់មាន Cron Job ឬធ្វើអ្វីដោយដៃឡើយ។
              </span>
            </div>
          )}
        </div>

        <div className="row">
          <div className="grow">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label style={{ margin: 0, fontWeight: 600 }}>Time limit</label>
              {Number(ex.timeLimitMinutes) > 0 ? (
                <span style={{ fontSize: '0.82rem', color: 'var(--brand)', fontWeight: 600 }}>
                  ⏱️ {ex.timeLimitMinutes} minutes
                </span>
              ) : (
                <span style={{ fontSize: '0.82rem', color: 'var(--muted)', fontWeight: 500 }}>
                  ♾️ No time limit
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="0"
                value={ex.timeLimitMinutes === undefined ? '0' : String(ex.timeLimitMinutes)}
                onChange={(e) => handleTimeChange(e.target.value)}
                onBlur={handleTimeBlur}
                style={{
                  maxWidth: 160,
                  fontWeight: 600,
                  fontSize: '1.05rem',
                }}
              />
              <span style={{ fontSize: '0.9rem', color: 'var(--muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                minutes (0 = none)
              </span>
            </div>
            {/* Quick preset buttons for instant 1-click selection */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {[
                { label: 'No limit (0)', val: 0 },
                { label: '10 min', val: 10 },
                { label: '15 min', val: 15 },
                { label: '20 min', val: 20 },
                { label: '30 min', val: 30 },
                { label: '45 min', val: 45 },
                { label: '60 min', val: 60 },
              ].map((preset) => {
                const active = Number(ex.timeLimitMinutes) === preset.val;
                return (
                  <button
                    key={preset.val}
                    type="button"
                    onClick={() => set({ timeLimitMinutes: preset.val })}
                    style={{
                      padding: '4px 10px',
                      fontSize: '0.8rem',
                      fontWeight: active ? 700 : 500,
                      borderRadius: 6,
                      border: active ? '1.5px solid var(--brand)' : '1px solid var(--line)',
                      background: active ? 'rgba(74, 103, 214, 0.16)' : 'var(--card)',
                      color: active ? 'var(--brand)' : 'var(--ink)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grow">
            <label>Deadline (optional)</label>
            <input
              type="datetime-local"
              value={toLocalInput(ex.deadline)}
              onChange={(e) => set({ deadline: e.target.value ? new Date(e.target.value).toISOString() : null })}
            />
          </div>
        </div>
        <label className="row" style={{ fontWeight: 500 }}>
          <input
            type="checkbox"
            checked={ex.oneAttemptPerName}
            onChange={(e) => set({ oneAttemptPerName: e.target.checked })}
          />
          Allow only one attempt per student name
        </label>
        <label className="row" style={{ fontWeight: 500 }}>
          <input
            type="checkbox"
            checked={!!ex.shuffleQuestions}
            onChange={(e) => set({ shuffleQuestions: e.target.checked })}
          />
          Show questions in a different order to each student
        </label>
        <label
          className="row"
          style={{
            fontWeight: 600,
            padding: '10px 12px',
            backgroundColor: ex.isSample ? 'rgba(16, 185, 129, 0.08)' : 'var(--card)',
            border: ex.isSample ? '1.5px solid #10b981' : '1px solid var(--line)',
            borderRadius: 8,
            marginTop: 4,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={!!ex.isSample}
            onChange={(e) => set({ isSample: e.target.checked })}
            style={{ width: 17, height: 17, accentColor: '#10b981' }}
          />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: ex.isSample ? '#059669' : 'inherit' }}>
                🌟 លំហាត់សាកល្បងឥតគិតថ្លៃ (Sample Test Case Exercise)
              </span>
              <span
                style={{
                  fontSize: '0.72rem',
                  padding: '2px 7px',
                  borderRadius: 10,
                  backgroundColor: '#10b981',
                  color: '#ffffff',
                  fontWeight: 800,
                }}
              >
                FREE TRIAL
              </span>
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginTop: 2, fontWeight: 400 }}>
              អនុញ្ញាតឱ្យសិស្សដែលទើបចុះឈ្មោះ និងមិនទាន់បានបង់ប្រាក់អាចសាកល្បងធ្វើបាន (Unpaid registered students can access this exercise)
            </span>
          </div>
        </label>
      </div>

      {/* 1. AI Exercise Prompt Section */}
      <div className="card stack" style={{ border: '1.5px solid var(--line)', backgroundColor: 'var(--card)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={20} color="var(--brand)" />
            <div>
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>AI Exercise Prompt</h2>
              <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
                Copy this prompt into ChatGPT or Claude and replace the grade, topic, and question count yourself.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn small"
            onClick={copyPrompt}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontWeight: 700,
              backgroundColor: copiedPrompt ? 'var(--good)' : 'var(--brand)',
              transition: 'background-color 0.2s ease',
            }}
          >
            {copiedPrompt ? <Check size={15} /> : <Copy size={15} />}
            <span>{copiedPrompt ? '✓ Copied!' : 'Copy Prompt'}</span>
          </button>
        </div>

        <textarea
          readOnly
          value={SAMPLE_AI_PROMPT}
          rows={5}
          style={{
            fontFamily: 'monospace',
            fontSize: '0.88rem',
            backgroundColor: 'var(--theme-page-bg, #f8fafc)',
            color: 'var(--ink)',
            lineHeight: 1.5,
            borderRadius: 8,
            border: '1px solid var(--line)',
            padding: '10px 12px',
          }}
          onClick={(e) => (e.target as HTMLTextAreaElement).select()}
        />
      </div>

      {/* 2. Paste AI-Generated Exercise JSON Section */}
      <div className="card stack" style={{ border: '1.5px solid var(--line)', backgroundColor: 'var(--card)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '1.4rem' }}>📋</span>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Paste AI-Generated Exercise JSON</h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
              Paste the complete JSON returned by ChatGPT or Claude, then click &quot;Import Exercise&quot;.
            </p>
          </div>
        </div>

        <textarea
          value={pasteText}
          onChange={(e) => {
            setPasteText(e.target.value);
            if (importError) setImportError('');
          }}
          rows={8}
          placeholder={`Paste complete JSON returned by ChatGPT or Claude here...\n\nExample:\n{\n  "title": "លំហាត់ប្រភាគ និងសមីការ",\n  "description": "លំហាត់អនុវត្ត",\n  "questions": [\n    {\n      "id": "q1",\n      "prompt": "គណនា $2/3 + 1/4$",\n      "kind": "choice",\n      "choices": ["11/12", "3/7", "5/12", "7/12"],\n      "answer": "11/12",\n      "points": 1,\n      "explanation": "តម្រូវភាគបែងរួម 12: 8/12 + 3/12 = 11/12"\n    }\n  ]\n}`}
          style={{
            fontFamily: 'monospace',
            fontSize: '0.88rem',
            lineHeight: 1.45,
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <button
            type="button"
            className="btn"
            disabled={!pasteText.trim()}
            onClick={importExerciseJson}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
          >
            ⚡ Import Exercise
          </button>

          {pasteText.trim() && (
            <button
              type="button"
              className="btn secondary small"
              onClick={() => {
                setPasteText('');
                setImportError('');
                setImportSuccess('');
              }}
            >
              Clear
            </button>
          )}
        </div>

        {importError && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 8,
              backgroundColor: 'var(--bad-bg, #fef2f2)',
              border: '1.5px solid var(--bad, #ef4444)',
              color: 'var(--bad, #dc2626)',
              fontSize: '0.92rem',
              fontWeight: 600,
            }}
          >
            ⚠️ {importError}
          </div>
        )}

        {importSuccess && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 8,
              backgroundColor: 'var(--good-bg, #f0fdf4)',
              border: '1.5px solid var(--good, #22c55e)',
              color: 'var(--good, #16a34a)',
              fontSize: '0.92rem',
              fontWeight: 600,
            }}
          >
            {importSuccess}
          </div>
        )}
      </div>

      {/* View Mode Toggle: Published View (clean output as students see) vs Raw Edit View */}
      <div className="card row spread" style={{ padding: '10px 16px' }}>
        <div className="row" style={{ gap: 10 }}>
          <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>View Mode:</span>
          <button
            type="button"
            className={`btn small ${viewMode === 'published' ? '' : 'secondary'}`}
            onClick={() => setViewMode('published')}
          >
            👁️ Published View (Student Preview)
          </button>
          <button
            type="button"
            className={`btn small ${viewMode === 'edit' ? '' : 'secondary'}`}
            onClick={() => setViewMode('edit')}
          >
            ✏️ Form Edit View
          </button>
        </div>
        <span className="muted" style={{ fontSize: '0.85rem' }}>
          {viewMode === 'published' ? 'Showing questions exactly as they appear when published' : 'Showing raw editable form inputs'}
        </span>
      </div>

      {viewMode === 'published' ? (
        /* ================= PUBLISHED PREVIEW MODE (Matches student screenshot) ================= */
        <div className="stack" style={{ gap: 12 }}>
          {ex.questions.map((q, i) => (
            <div className="card q-card" key={q.id}>
              {/* Question number and exercise on 1 line: "1. (-12) + 7 = ?" */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <div className="q-title" style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3 }}>
                  <span style={{ marginRight: 6 }}>{i + 1}.</span>
                  <MathText text={q.prompt} />
                </div>
                <span className="muted" style={{ fontSize: '0.78rem', marginLeft: 10, flexShrink: 0 }}>
                  {q.points} {q.points === 1 ? 'pt' : 'pts'}
                </span>
              </div>

              {q.kind === 'choice' ? (
                <div className="stack" style={{ gap: 10 }}>
                  {(q.choices ?? []).map((c, k) => {
                    const isKey = Number(q.answer) === k;
                    return (
                      <div
                        key={k}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          fontSize: '1.08rem',
                          fontWeight: 500,
                          color: 'var(--ink)',
                          padding: '3px 0',
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-block',
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            border: isKey ? '3px solid var(--good)' : '2.5px solid var(--muted)',
                            background: 'var(--card)',
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <MathText text={c} />
                          {isKey && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--good)', fontWeight: 600, background: 'var(--good-bg)', padding: '2px 7px', borderRadius: 4 }}>
                              Answer Key
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ marginTop: 12 }}>
                  <div style={{ maxWidth: 320, padding: '10px 14px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg)', color: 'var(--muted)' }}>
                    {q.kind === 'number' ? 'Number or fraction answer input' : 'Text answer input'}
                  </div>
                  {q.answer && (
                    <div style={{ marginTop: 8, fontSize: '0.88rem', color: 'var(--good)', fontWeight: 600 }}>
                      ✓ Correct Answer: <MathText text={q.answer} />
                    </div>
                  )}
                </div>
              )}

              {q.explanation && (
                <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, fontSize: '0.9rem', color: 'var(--ink)' }}>
                  <strong>Explanation:</strong> <MathText text={q.explanation} />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* ================= RAW EDIT VIEW MODE ================= */
        <>
          <div className="notice muted">
            Write math with LaTeX between dollar signs, e.g. <code>$\frac{'{3}{4}'}+\frac{'{1}{2}'}$</code>,{' '}
            <code>$x^2+2x+1$</code>, <code>$\sqrt{'{49}'}$</code>. Khmer text works anywhere. For several accepted
            answers, separate them with <code>|</code> (e.g. <code>x&gt;=2|x≥2</code>).
          </div>

          {ex.questions.map((q, i) => (
            <div className="card stack" key={q.id}>
              <div className="row spread">
                <div className="row">
                  <h2>Question {i + 1}</h2>
                  {q.aiGenerated && <span className="badge warn">AI · Check answer</span>}
                </div>
                <div className="row">
                  <button className="btn secondary small" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                  <button className="btn secondary small" onClick={() => move(i, 1)} disabled={i === ex.questions.length - 1}>↓</button>
                  <button
                    className="btn danger small"
                    onClick={() => set({ questions: ex.questions.filter((_, j) => j !== i) })}
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div>
                <label>Question</label>
                <textarea value={q.prompt} onChange={(e) => setQ(i, { prompt: e.target.value })} />
                <div className="preview">
                  {q.prompt ? <MathText text={q.prompt} /> : <span className="muted">Preview appears here</span>}
                </div>
              </div>
              <div className="row">
                <div className="grow">
                  <label>Answer type</label>
                  <select value={q.kind} onChange={(e) => changeKind(i, e.target.value as Question['kind'])}>
                    <option value="number">Number or fraction (3/4 = 0.75)</option>
                    <option value="text">Text / expression</option>
                    <option value="choice">Multiple choice</option>
                  </select>
                </div>
                {q.kind !== 'choice' && (
                  <div className="grow">
                    <label>Correct answer</label>
                    <input value={q.answer} onChange={(e) => setQ(i, { answer: e.target.value })} />
                    {q.answer && (
                      <div className="preview" style={{ marginTop: 6, minHeight: 32 }}>
                        <MathText text={q.answer} />
                      </div>
                    )}
                  </div>
                )}
                <div style={{ width: 90 }}>
                  <label>Points</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={q.points === undefined ? '1' : String(q.points)}
                    onChange={(e) => {
                      const ascii = toAsciiDigits(e.target.value).replace(/[^\d]/g, '');
                      setQ(i, { points: ascii as any });
                    }}
                    onBlur={() => {
                      const pts = Math.max(0, parseInt(String(q.points || '0'), 10) || 0);
                      setQ(i, { points: pts });
                    }}
                  />
                </div>
              </div>

              {q.kind === 'choice' && (
                <div className="stack">
                  <label>Choices (select the correct one)</label>
                  {(q.choices ?? []).map((c, k) => (
                    <div key={k} className="stack" style={{ marginTop: 6 }}>
                      <div className="row">
                        <input
                          type="radio"
                          name={`correct-${q.id}`}
                          checked={Number(q.answer) === k}
                          onChange={() => setQ(i, { answer: String(k) })}
                          style={{ width: 'auto' }}
                          aria-label={`Choice ${k + 1} is correct`}
                        />
                        <input
                          className="grow"
                          value={c}
                          placeholder={`Choice ${k + 1}`}
                          onChange={(e) => setChoice(i, k, e.target.value)}
                        />
                        <button
                          className="btn danger small"
                          onClick={() => removeChoice(i, k)}
                          disabled={(q.choices?.length ?? 0) <= 2}
                        >
                          ×
                        </button>
                      </div>
                      {c.trim() && (
                        <div className="preview" style={{ marginTop: 4, minHeight: 30 }}>
                          <MathText text={c} />
                        </div>
                      )}
                    </div>
                  ))}
                  <div>
                    <button
                      className="btn secondary small"
                      onClick={() => addChoice(i)}
                      disabled={(q.choices?.length ?? 0) >= 6}
                    >
                      + Add choice
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label>Explanation shown after submitting (optional)</label>
                <textarea value={q.explanation} onChange={(e) => setQ(i, { explanation: e.target.value })} />
                {q.explanation && (
                  <div className="preview">
                    <MathText text={q.explanation} />
                  </div>
                )}
              </div>
            </div>
          ))}

          <div>
            <button className="btn secondary" onClick={() => set({ questions: [...ex.questions, blankQuestion()] })}>
              + Add question
            </button>
          </div>
        </>
      )}

      {error && <div className="error">{error}</div>}

      <div className="card row spread" style={{ alignItems: 'center' }}>
        <span className="muted">
          {ex.questions.length} questions · {total} points total
        </span>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          {id !== 'new' && (
            <button
              type="button"
              className="btn secondary"
              disabled={saving}
              onClick={async () => {
                if (!ex) return;
                setSaving(true);
                try {
                  const copyData: Exercise = {
                    ...ex,
                    title: `${ex.title} (ចម្លង/Copy)`,
                    published: false,
                    publicationMode: 'draft',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                  };
                  const ref = await addDoc(collection(getDb(), 'exercises'), copyData);
                  router.push(`/admin/exercises/${ref.id}`);
                } catch (e: any) {
                  setError(e?.message || 'Failed to duplicate.');
                  setSaving(false);
                }
              }}
            >
              Duplicate (ចម្លង)
            </button>
          )}
          <button className="btn secondary" disabled={saving} onClick={() => save()}>
            {ex.publicationMode === 'draft' ? 'Save Draft (រក្សាទុក)' : 'Save (រក្សាទុក)'}
          </button>
          {ex.published ? (
            <button className="btn danger" disabled={saving} onClick={() => save(false)}>
              Unpublish (ដកចេញ)
            </button>
          ) : (
            <button className="btn" disabled={saving} onClick={() => save(true)}>
              {ex.publicationMode === 'scheduled' ? 'Save & Schedule (កំណត់ពេល)' : 'Save & Publish (ផ្សាយ)'}
            </button>
          )}
        </div>
      </div>

      {id !== 'new' && ex.published && (
        <div className="notice">
          Student link: <code>{typeof window !== 'undefined' ? `${window.location.origin}/e/${id}` : ''}</code>
        </div>
      )}
    </div>
  );
}
