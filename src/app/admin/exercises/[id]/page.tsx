'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { addDoc, collection, doc, getDoc, setDoc } from 'firebase/firestore';
import { Moon, Sun, Copy, Check, Sparkles } from 'lucide-react';
import { getDb } from '@/lib/firebaseClient';
import { useAdmin } from '@/lib/useAdmin';
import MathText from '@/components/MathText';
import ChoiceText from '@/components/ChoiceText';
import type { Exercise, Question } from '@/lib/types';
import { parseExerciseInput } from '@/lib/parseQuestions';
import { toText } from '@/lib/textValue';
import { CAMBODIAN_MATH_CURRICULUM } from '@/lib/curriculum';

function getAiExercisePrompt(targetGrade?: number, targetTopic?: string, questionCount: number = 5): string {
  const gStr = targetGrade ? `Grade ${targetGrade}` : 'Grade [GRADE]';
  const tStr = targetTopic ? `"${targetTopic}"` : '[TOPIC]';
  return `Create a high-quality mathematics exercise for ${gStr} about ${tStr} with ${questionCount} questions. Write in Khmer (ភាសាខ្មែរ). Mix easy, medium, and slightly advanced questions: 40% easy, 40% medium, and 20% advanced. Create age-appropriate questions with correct answers, point values, and clear step-by-step explanations so students can understand their mistakes when they answer incorrectly. Include a suitable Khmer exercise title and a short Khmer description.

LaTeX Mathematical Formula Standards:
1. Wrap all mathematical expressions, equations, and fractions in LaTeX using single dollar signs $...$ for inline formulas or double dollar signs $$...$$ for display formulas.
2. Use standard LaTeX:
   - Fractions: $\\frac{a}{b}$
   - Powers: $x^2$, $a^{n+1}$
   - Roots: $\\sqrt{x}$, $\\sqrt[3]{x}$
   - Multiplication & Division: $\\times$, $\\div$
   - Comparison & Logic: $\\le$, $\\ge$, $\\neq$, $\\approx$
   - Equations: $2x + 5 = 15$
   - Limits & Sums: $\\lim_{x \\to 0} f(x)$, $\\sum_{i=1}^n i$
3. In Khmer text, keep Khmer words outside the $...$ delimiters.
4. Escape backslashes properly in JSON (e.g. "\\\\frac{1}{2}").

Return ONLY valid JSON matching this exact structure:
{
  "title": "ចំណងជើងលំហាត់គណិតវិទ្យា",
  "description": "ការណែនាំសង្ខេបសម្រាប់សិស្ស",
  "timeLimitMinutes": 20,
  "shuffleQuestions": false,
  "questions": [
    {
      "id": "q1",
      "prompt": "គណនា $\\\\frac{2}{3} + \\\\frac{1}{4}$",
      "kind": "choice",
      "choices": ["$\\\\frac{11}{12}$", "$\\\\frac{3}{7}$", "$\\\\frac{5}{12}$", "$\\\\frac{7}{12}$"],
      "answer": "$\\\\frac{11}{12}$",
      "points": 1,
      "explanation": "តម្រូវភាគបែងរួម 12: $\\\\frac{8}{12} + \\\\frac{3}{12} = \\\\frac{11}{12}$"
    },
    {
      "id": "q2",
      "prompt": "ដោះស្រាយសមីការ $2x + 6 = 18$",
      "kind": "number",
      "answer": "6",
      "points": 1,
      "explanation": "$2x = 18 - 6 = 12 \\\\Rightarrow x = \\\\frac{12}{2} = 6$"
    }
  ]
}

Important Rules:
1. For multiple-choice questions ("kind": "choice"), provide 2 to 6 choices and make sure "answer" matches one of the choices or its 0-based index.
2. For direct-answer questions ("kind": "number" or "kind": "text"), provide the exact correct answer.
3. Return ONLY valid JSON with no markdown backticks (\`\`\`json) and no conversational text outside the JSON.`;
}

const SAMPLE_AI_PROMPT = getAiExercisePrompt();

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
  const [copiedQId, setCopiedQId] = useState<string | null>(null);
  const [copiedAllJson, setCopiedAllJson] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const [viewMode, setViewMode] = useState<'published' | 'edit'>('published');
  const [customChapters, setCustomChapters] = useState<string[]>([]);
  const [customTopics, setCustomTopics] = useState<string[]>([]);
  const [customGrades, setCustomGrades] = useState<(number | string)[]>([7, 8, 9, 10, 11, 12]);

  const [origin, setOrigin] = useState('');

  useEffect(() => {
    getDoc(doc(getDb(), 'settings', 'app'))
      .then((s) => {
        if (s.exists()) {
          const data = s.data();
          if (Array.isArray(data.customGrades) && data.customGrades.length > 0) {
            setCustomGrades(data.customGrades);
          }
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  // Load custom chapters & topics from localStorage
  useEffect(() => {
    try {
      const savedCh = localStorage.getItem('custom_math_chapters');
      if (savedCh) setCustomChapters(JSON.parse(savedCh));
      const savedTp = localStorage.getItem('custom_math_topics');
      if (savedTp) setCustomTopics(JSON.parse(savedTp));
    } catch {}
  }, []);

  const rememberCustomChapter = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    setCustomChapters((prev) => {
      if (prev.includes(trimmed)) return prev;
      const next = [trimmed, ...prev].slice(0, 50);
      try {
        localStorage.setItem('custom_math_chapters', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const rememberCustomTopic = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    setCustomTopics((prev) => {
      if (prev.includes(trimmed)) return prev;
      const next = [trimmed, ...prev].slice(0, 50);
      try {
        localStorage.setItem('custom_math_topics', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

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

  const currentAiPrompt = useMemo(() => {
    const singleGrade = ex?.gradeLevels && ex.gradeLevels.length === 1 ? ex.gradeLevels[0] : (ex?.gradeLevels?.[0]);
    const topic = ex?.topic || ex?.chapter || '';
    return getAiExercisePrompt(singleGrade, topic, 5);
  }, [ex?.gradeLevels, ex?.topic, ex?.chapter]);

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
            if (!isNaN(gNum) && gNum >= 1 && gNum <= 30) gradeLevels = [gNum];
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
      .then((s) => {
        if (!s.exists()) {
          setError('Exercise not found.');
          return;
        }
        const data = s.data() as Exercise;
        // Normalize loaded questions to guarantee array integrity and string fields
        const safeQuestions: Question[] = (Array.isArray(data.questions) ? data.questions : []).map((q, idx) => ({
          id: String(q?.id || `q_${idx}_${newId()}`),
          prompt: toText(q?.prompt),
          kind: q?.kind === 'choice' ? 'choice' : q?.kind === 'number' ? 'number' : 'text',
          choices: Array.isArray(q?.choices) ? q.choices.map((c) => toText(c)) : undefined,
          answer: toText(q?.answer),
          points: Math.max(0, Number(q?.points) || 1),
          explanation: toText(q?.explanation),
          aiGenerated: Boolean(q?.aiGenerated),
        }));
        if (safeQuestions.length === 0) {
          safeQuestions.push(blankQuestion());
        }
        setEx({
          ...data,
          title: String(data.title ?? ''),
          description: String(data.description ?? ''),
          chapter: String(data.chapter ?? ''),
          topic: String(data.topic ?? ''),
          questions: safeQuestions,
          gradeLevels: Array.isArray(data.gradeLevels) && data.gradeLevels.length > 0 ? data.gradeLevels : [7, 8, 9, 10, 11, 12],
          timeLimitMinutes: Math.max(0, Number(data.timeLimitMinutes) || 0),
          publicationMode: data.publicationMode || 'instant',
        });
      })
      .catch((e) => setError(e?.message || 'Error loading exercise'));
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

  const copyToClipboard = async (text: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      return true;
    } catch {
      return false;
    }
  };

  const copyPrompt = async () => {
    await copyToClipboard(currentAiPrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const copyQuestionJson = async (q: Question) => {
    // Generate clean, canonical question JSON ready to paste/import
    const formatted: any = {
      id: q.id,
      prompt: q.prompt,
      kind: q.kind,
      points: Number(q.points) || 1,
    };
    if (q.kind === 'choice') {
      formatted.choices = q.choices ?? [];
      const choiceIndex = parseInt(q.answer, 10);
      if (!isNaN(choiceIndex) && q.choices && q.choices[choiceIndex] !== undefined) {
        formatted.answer = q.choices[choiceIndex];
      } else {
        formatted.answer = q.answer;
      }
    } else {
      formatted.answer = q.answer;
    }
    if (q.explanation) {
      formatted.explanation = q.explanation;
    }
    await copyToClipboard(JSON.stringify(formatted, null, 2));
    setCopiedQId(q.id);
    setTimeout(() => setCopiedQId(null), 2000);
  };

  const copyAllQuestionsJson = async () => {
    if (!ex) return;
    const data = {
      title: ex.title,
      description: ex.description,
      chapter: ex.chapter,
      topic: ex.topic,
      timeLimitMinutes: ex.timeLimitMinutes,
      shuffleQuestions: ex.shuffleQuestions,
      questions: ex.questions.map((q) => {
        const item: any = {
          id: q.id,
          prompt: q.prompt,
          kind: q.kind,
          points: Number(q.points) || 1,
        };
        if (q.kind === 'choice') {
          item.choices = q.choices ?? [];
          const choiceIndex = parseInt(q.answer, 10);
          if (!isNaN(choiceIndex) && q.choices && q.choices[choiceIndex] !== undefined) {
            item.answer = q.choices[choiceIndex];
          } else {
            item.answer = q.answer;
          }
        } else {
          item.answer = q.answer;
        }
        if (q.explanation) item.explanation = q.explanation;
        return item;
      }),
    };
    await copyToClipboard(JSON.stringify(data, null, 2));
    setCopiedAllJson(true);
    setTimeout(() => setCopiedAllJson(false), 2000);
  };

  function importExerciseJson() {
    setImportError('');
    setImportSuccess('');

    const raw = pasteText.trim();
    if (!raw) {
      setImportError('Please paste your script, JSON, or text into the box first.');
      return;
    }

    const parsed = parseExerciseInput(raw);
    const qs = parsed.questions;
    if (!qs || qs.length === 0) {
      setImportError('No questions found. Please check your format (Google Apps Script FormApp, JSON, or numbered text format).');
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

    let msg = `✓ Successfully converted ${qs.length} question${qs.length === 1 ? '' : 's'}`;
    if (parsed.title) msg += ` with title "${parsed.title}"`;
    if (parsed.timeLimitMinutes) msg += ` (${parsed.timeLimitMinutes} min limit)`;
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

      if (data.chapter) rememberCustomChapter(data.chapter);
      if (data.topic) rememberCustomTopic(data.topic);

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
                const officialTitles = new Set(curChapters.map((c) => c.titleKh));
                const customOnly = customChapters.filter((c) => !officialTitles.has(c));

                if (curChapters.length === 0 && customOnly.length === 0) return null;
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
                    <option value="">ជ្រើសរើសជំពូក...</option>
                    {curChapters.length > 0 && (
                      <optgroup label={`កម្មវិធីសិក្សា (ថ្នាក់ទី ${targetGrade})`}>
                        {curChapters.map((c) => (
                          <option key={c.id} value={c.titleKh}>{c.titleKh}</option>
                        ))}
                      </optgroup>
                    )}
                    {customOnly.length > 0 && (
                      <optgroup label="ជំពូកដែលអ្នកបានបន្ថែម (Custom)">
                        {customOnly.map((title, idx) => (
                          <option key={`custom_ch_${idx}`} value={title}>{title}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                );
              })()}
            </div>
            <input
              value={ex.chapter || ''}
              onChange={(e) => set({ chapter: e.target.value })}
              onBlur={(e) => {
                if (e.target.value.trim()) rememberCustomChapter(e.target.value.trim());
              }}
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
                const officialLessonTitles = new Set(lessons.map((l) => l.titleKh));
                const customOnly = customTopics.filter((t) => !officialLessonTitles.has(t));

                if (lessons.length === 0 && customOnly.length === 0) return null;
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
                    <option value="">ជ្រើសរើសមេរៀន...</option>
                    {lessons.length > 0 && (
                      <optgroup label="កម្មវិធីសិក្សា (Curriculum)">
                        {lessons.map((l) => (
                          <option key={l.id} value={l.titleKh}>{l.titleKh}</option>
                        ))}
                      </optgroup>
                    )}
                    {customOnly.length > 0 && (
                      <optgroup label="មេរៀនដែលអ្នកបានបន្ថែម (Custom)">
                        {customOnly.map((title, idx) => (
                          <option key={`custom_tp_${idx}`} value={title}>{title}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                );
              })()}
            </div>
            <input
              value={ex.topic || ''}
              onChange={(e) => set({ topic: e.target.value })}
              onBlur={(e) => {
                if (e.target.value.trim()) rememberCustomTopic(e.target.value.trim());
              }}
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
                const allActive = (customGrades.length > 0 ? customGrades : [7, 8, 9, 10, 11, 12]).map((x) => typeof x === 'number' ? x : (Number(x) || 7));
                if (current.length === allActive.length) {
                  set({ gradeLevels: [allActive[0]] });
                } else {
                  set({ gradeLevels: [...allActive] });
                }
              }}
            >
              {(ex.gradeLevels?.length ?? (customGrades.length || 6)) === (customGrades.length || 6) ? 'ជ្រើសរើសថ្នាក់តែមួយ' : 'គ្រប់កម្រិតថ្នាក់'}
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(customGrades.length > 0 ? customGrades : [7, 8, 9, 10, 11, 12]).map((g) => {
              const numVal = typeof g === 'number' ? g : (Number(g) || 7);
              const selected = (ex.gradeLevels && ex.gradeLevels.length > 0)
                ? (ex.gradeLevels.includes(numVal) || (ex.gradeLevels as any[]).includes(g))
                : true;
              const isNum = typeof g === 'number' || (!isNaN(Number(g)) && String(g).trim() !== '');
              const label = isNum ? `ថ្នាក់ទី ${g} (Grade ${g})` : String(g);
              return (
                <label
                  key={String(g)}
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
                      const fallback = (customGrades.length > 0 ? customGrades : [7, 8, 9, 10, 11, 12]).map((x) => typeof x === 'number' ? x : (Number(x) || 7));
                      const current = ex.gradeLevels && ex.gradeLevels.length > 0 ? [...ex.gradeLevels] : [...fallback];
                      if (e.target.checked) {
                        if (!current.includes(numVal)) current.push(numVal);
                      } else {
                        const idx = current.indexOf(numVal);
                        if (idx >= 0 && current.length > 1) current.splice(idx, 1);
                      }
                      set({ gradeLevels: current.sort((a, b) => a - b) });
                    }}
                    style={{ accentColor: 'var(--brand)' }}
                  />
                  <span>{label}</span>
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
                border: ex.publicationMode === 'drip' ? '1.5px solid var(--brand)' : '1px solid var(--line)',
                background: ex.publicationMode === 'drip' ? 'rgba(74, 103, 214, 0.12)' : 'var(--card)',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="publicationMode"
                value="drip"
                checked={ex.publicationMode === 'drip'}
                onChange={() => set({ publicationMode: 'drip', published: true, dripDay: ex.dripDay || 1, scheduledPublishAt: null })}
                style={{ marginTop: 2, accentColor: 'var(--brand)' }}
              />
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>💧 បញ្ចេញតាមថ្ងៃ (Drip Day 1–30, 5 days/week)</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                  ដោះសោតាមថ្ងៃគិតពីថ្ងៃដែលសិស្សម្នាក់ៗចុះឈ្មោះ
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

          {ex.publicationMode === 'drip' && (
            <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(74, 103, 214, 0.08)', border: '1.5px solid rgba(74, 103, 214, 0.3)', marginBottom: 12 }}>
              <label style={{ fontWeight: 700, display: 'block', marginBottom: 6, color: 'var(--brand)' }}>
                💧 កំណត់ថ្ងៃត្រូវដោះសោ (Drip Unlock Day Number)
              </label>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.92rem', fontWeight: 700 }}>ថ្ងៃទី (Day) ៖</span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={ex.dripDay ?? 1}
                    onChange={(e) => set({ dripDay: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                    style={{ width: 80, padding: '6px 10px', borderRadius: 8, fontWeight: 700, textAlign: 'center' }}
                  />
                </div>
                <span style={{ fontSize: '0.84rem', color: 'var(--muted)' }}>
                  • ថ្ងៃទី ១ = ដោះសោភ្លាមៗពេលសិស្សចុះឈ្មោះ
                  • ថ្ងៃទី ២, ៣, ... = ដោះសោម្តងមួយថ្ងៃ ចាប់ពីម៉ោង ០០:០០ ថ្ងៃច័ន្ទ–សុក្រ (មិនបើកថ្ងៃសៅរ៍ និងអាទិត្យ)
                  • ១ សប្តាហ៍ប្រើ ៥ ថ្ងៃ ៖ ១–៥, ៨–១២, ១៥–១៩, ២២–២៦, ២៩–៣០ · រំលង ៦-៧, ១៣-១៤, ២០-២១, ២៧-២៨ (ថ្ងៃទី ៨ = សប្តាហ៍ក្រោយ)
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted)', alignSelf: 'center' }}>ជ្រើសរើសរហ័ស ៖</span>
                {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => (
                  <button
                    key={d}
                    type="button"
                    title={(d - 1) % 7 >= 5 ? 'Weekend number (skip)' : undefined}
                    onClick={() => set({ dripDay: d })}
                    style={{
                      opacity: (d - 1) % 7 >= 5 ? 0.4 : 1,
                      fontSize: '0.75rem',
                      padding: '2px 8px',
                      borderRadius: 6,
                      border: '1px solid var(--line)',
                      background: (ex.dripDay ?? 1) === d ? 'var(--brand)' : 'var(--card)',
                      color: (ex.dripDay ?? 1) === d ? '#ffffff' : 'inherit',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    Day {d}
                  </button>
                ))}
              </div>
            </div>
          )}

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
          value={currentAiPrompt}
          rows={6}
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

      {/* 2. Convert Script / JSON to Quiz Section */}
      <div className="card stack" style={{ border: '1.5px solid var(--line)', backgroundColor: 'var(--card)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '1.4rem' }}>⚡</span>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Convert Script / JSON / Text to Quiz</h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
              Paste <strong>Google Apps Script (FormApp)</strong>, <strong>JSON</strong>, or <strong>plain text questions</strong> below and convert them into interactive quiz questions instantly.
            </p>
          </div>
        </div>

        <textarea
          value={pasteText}
          onChange={(e) => {
            setPasteText(e.target.value);
            if (importError) setImportError('');
          }}
          rows={9}
          placeholder={`Paste Google Apps Script, JSON, or plain text here...\n\nExample Google Apps Script:\nfunction createQuiz() {\n  var form = FormApp.create("លំហាត់គណិតវិទ្យា");\n  form.setTimeLimit(30);\n  var item = form.addMultipleChoiceItem();\n  item.setTitle("គណនា $\\\\frac{2}{3} + \\\\frac{1}{4}$")\n      .setChoices([\n        item.createChoice("$\\\\frac{11}{12}$", true),\n        item.createChoice("$\\\\frac{3}{7}$")\n      ]);\n}\n\nOr paste JSON ({ "title": "...", "questions": [...] }) or standard numbered questions.`}
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
            ⚡ Convert to Quiz
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
      <div className="card row spread" style={{ padding: '10px 16px', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
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
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            className="btn secondary small"
            onClick={copyAllQuestionsJson}
            title="Copy entire exercise data as JSON so you can backup, share, or edit it"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontWeight: 700,
              fontSize: '0.82rem',
              backgroundColor: copiedAllJson ? 'var(--good-bg, #ecfdf5)' : undefined,
              borderColor: copiedAllJson ? 'var(--good, #10b981)' : undefined,
              color: copiedAllJson ? 'var(--good, #059669)' : undefined,
            }}
          >
            {copiedAllJson ? <Check size={14} /> : <Copy size={14} />}
            <span>{copiedAllJson ? '✓ Copied All JSON' : '📋 Copy All JSON'}</span>
          </button>
          <span className="muted" style={{ fontSize: '0.82rem' }}>
            {viewMode === 'published' ? 'Showing questions as students see' : 'Showing editable form inputs'}
          </span>
        </div>
      </div>

      {viewMode === 'published' ? (
        /* ================= PUBLISHED PREVIEW MODE (Matches student screenshot) ================= */
        <div className="stack" style={{ gap: 12 }}>
          {ex.questions.map((q, i) => (
            <div className="card q-card" key={q.id}>
              {/* Question header with badge, points and Copy JSON button */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: 999,
                      backgroundColor: 'var(--theme-page-bg, #f8fafc)',
                      border: '1px solid var(--line)',
                      color: 'var(--ink)',
                    }}
                  >
                    សំណួរទី {i + 1}
                  </span>
                  <span className="muted" style={{ fontSize: '0.78rem' }}>
                    {q.points} {q.points === 1 ? 'pt' : 'pts'}
                  </span>
                </div>

                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => copyQuestionJson(q)}
                  title="Copy this question's JSON data"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: '0.78rem',
                    padding: '3px 9px',
                    borderRadius: 6,
                    backgroundColor: copiedQId === q.id ? 'var(--good-bg, #ecfdf5)' : undefined,
                    borderColor: copiedQId === q.id ? 'var(--good, #10b981)' : undefined,
                    color: copiedQId === q.id ? 'var(--good, #059669)' : undefined,
                  }}
                >
                  {copiedQId === q.id ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copiedQId === q.id ? '✓ Copied JSON' : 'Copy Question JSON'}</span>
                </button>
              </div>

              {/* Question prompt */}
              <div className="q-title" style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--ink)', lineHeight: 1.45, marginBottom: 12 }}>
                <span style={{ marginRight: 6 }}>{i + 1}.</span>
                <MathText text={q.prompt} />
              </div>

              {q.kind === 'choice' ? (
                <div className="stack" style={{ gap: 10 }}>
                  {(q.choices ?? []).map((c, k) => {
                    const isKey = Number(q.answer) === k || String(q.answer).trim() === toText(c).trim();
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
                          padding: '4px 0',
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <ChoiceText choice={c} index={k} />
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
              <div className="row spread" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div className="row" style={{ alignItems: 'center', gap: 8 }}>
                  <h2>Question {i + 1}</h2>
                  {q.aiGenerated && <span className="badge warn">AI · Check answer</span>}
                </div>
                <div className="row" style={{ alignItems: 'center', gap: 6 }}>
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={() => copyQuestionJson(q)}
                    title="Copy this question's JSON data"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: '0.78rem',
                      padding: '4px 8px',
                      backgroundColor: copiedQId === q.id ? 'var(--good-bg, #ecfdf5)' : undefined,
                      borderColor: copiedQId === q.id ? 'var(--good, #10b981)' : undefined,
                      color: copiedQId === q.id ? 'var(--good, #059669)' : undefined,
                    }}
                  >
                    {copiedQId === q.id ? <Check size={13} /> : <Copy size={13} />}
                    <span>{copiedQId === q.id ? '✓ Copied' : 'Copy JSON'}</span>
                  </button>
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
          Student link: <code>{origin ? `${origin}/e/${id}` : `/e/${id}`}</code>
        </div>
      )}
    </div>
  );
}
