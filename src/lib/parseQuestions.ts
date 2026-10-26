import type { Question } from './types';

const newId = () => Math.random().toString(36).slice(2, 10);

const START = /^\s*(?:Q(?:uestion)?\s*)?\d+\s*[.):]\s*/i;
const CHOICE = /^\s*\(?([A-Fa-f])[.)]\s*(.*)$/;
const ANSWER = /^\s*(?:answer|ans|correct)\s*[:=]\s*(.*)$/i;
const EXPLAIN = /^\s*(?:explanation|solution|exp)\s*[:=]\s*(.*)$/i;
const POINTS = /^\s*points?\s*[:=]\s*(\d+(?:\.\d+)?)/i;
const NUMERIC = /^[-−+]?\d+(?:[.,]\d+)?(?:\/\d+)?$/;

// ---------- Google Apps Script (Forms) support ----------
// Parsed as text only; the pasted code is never executed.
const STR = String.raw`(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|` + '`((?:[^`\\\\]|\\\\.)*)`)';
const ADD_ITEM = /add(MultipleChoice|CheckBox|List|Text|ParagraphText)Item\s*\(/g;

function unescapeJs(s: string) {
  return s.replace(/\\(n|t|'|"|`|\\)/g, (_, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));
}
const strOf = (m: RegExpMatchArray | RegExpExecArray, at: number) => unescapeJs(m[at] ?? m[at + 1] ?? m[at + 2] ?? '');

export function looksLikeAppsScript(text: string) {
  ADD_ITEM.lastIndex = 0;
  return ADD_ITEM.test(text);
}

export interface ParsedExerciseData {
  title?: string;
  description?: string;
  timeLimitMinutes?: number;
  shuffleQuestions?: boolean;
  questions: Question[];
}

function parseAppsScript(text: string): ParsedExerciseData {
  let title = '';
  let description = '';
  let timeLimitMinutes = 0;
  let shuffleQuestions = false;

  // Extract Form title: FormApp.create('Quiz Title') or form.setTitle('Quiz Title')
  const createTitle = text.match(new RegExp('FormApp\\.create\\s*\\(\\s*' + STR));
  const setTitle = text.match(new RegExp('(?:form|quiz)\\.setTitle\\s*\\(\\s*' + STR));
  if (createTitle) title = strOf(createTitle, 1).trim();
  else if (setTitle) title = strOf(setTitle, 1).trim();

  // Extract description: form.setDescription('...')
  const desc = text.match(new RegExp('\\.setDescription\\s*\\(\\s*' + STR));
  if (desc) description = strOf(desc, 1).trim();

  // Extract time limit: // time: 30 or // timelimit: 30 mins or form.setTimeLimit(30)
  const timeComment = text.match(/\/\/\s*(?:time(?:limit)?|duration)\s*[:=]\s*(\d+)/i);
  const timeFunc = text.match(/\.setTimeLimit(?:Minutes)?\s*\(\s*(\d+)/i);
  if (timeComment) timeLimitMinutes = Number(timeComment[1]);
  else if (timeFunc) timeLimitMinutes = Number(timeFunc[1]);

  // Extract shuffle: form.setShuffleQuestions(true) or // shuffle: true
  const shuffleMatch = text.match(/\.setShuffleQuestions\s*\(\s*(true|false)/i);
  const shuffleComment = text.match(/\/\/\s*shuffle\s*[:=]\s*(true|yes)/i);
  if (shuffleMatch) shuffleQuestions = shuffleMatch[1].toLowerCase() === 'true';
  else if (shuffleComment) shuffleQuestions = true;

  const starts: { index: number; type: string }[] = [];
  ADD_ITEM.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ADD_ITEM.exec(text))) starts.push({ index: m.index, type: m[1] });

  const questions: Question[] = [];
  starts.forEach((s, n) => {
    const seg = text.slice(s.index, n + 1 < starts.length ? starts[n + 1].index : text.length);

    const titleMatch = seg.match(new RegExp('setTitle\\s*\\(\\s*' + STR));
    if (!titleMatch) return;
    let prompt = strOf(titleMatch, 1).trim();
    if (!prompt) return;
    // Strip leading question numbering like "39. ", "1) ", "Question 1: " so it won't duplicate "Question 1 \n 39. "
    prompt = prompt.replace(/^\s*(?:Q(?:uestion)?\s*)?\d+\s*[.):]\s*/i, '').trim() || prompt;

    const points = seg.match(/setPoints\s*\(\s*(\d+(?:\.\d+)?)/);
    const fb = seg.match(new RegExp('setText\\s*\\(\\s*' + STR));
    const q: Question = {
      id: newId(),
      prompt,
      kind: 'text',
      answer: '',
      points: points ? Number(points[1]) : 1,
      explanation: fb ? strOf(fb, 1).trim() : '',
    };

    const choices: string[] = [];
    let correct = -1;
    const cc = new RegExp('createChoice\\s*\\(\\s*' + STR + '\\s*(?:,\\s*(true|false))?\\s*\\)', 'g');
    let c: RegExpExecArray | null;
    while ((c = cc.exec(seg))) {
      if (c[4] === 'true' && correct < 0) correct = choices.length;
      choices.push(strOf(c, 1));
    }
    if (choices.length === 0) {
      const cv = seg.match(/setChoiceValues\s*\(\s*\[([\s\S]*?)\]\s*\)/);
      if (cv) {
        const sr = new RegExp(STR, 'g');
        let x: RegExpExecArray | null;
        while ((x = sr.exec(cv[1]))) choices.push(strOf(x, 1));
      }
    }

    if (choices.length >= 2) {
      q.kind = 'choice';
      q.choices = choices;
      q.answer = String(correct >= 0 ? correct : 0);
      if (correct < 0) q.aiGenerated = true; // no correct choice marked: flag "Check answer"
    } else {
      // Forms scripts can't store a text answer, so allow a comment:  // answer: 3/4
      const a = seg.match(/\/\/\s*(?:answer|ans)\s*[:=]\s*(.+)/i);
      q.answer = a ? a[1].trim() : '';
      if (!q.answer) q.aiGenerated = true;
      else if (NUMERIC.test(q.answer.split('|')[0].trim())) q.kind = 'number';
    }
    questions.push(q);
  });
  return { title, description, timeLimitMinutes, shuffleQuestions, questions };
}

function parseJsonQuestions(text: string): ParsedExerciseData | null {
  const trimmed = text.trim();
  let jsonStr = trimmed;

  // Extract from markdown ```json ... ``` if present
  const mdMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (mdMatch) {
    jsonStr = mdMatch[1].trim();
  } else {
    // Locate outer-most { ... } or [ ... ]
    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    const firstBracket = jsonStr.indexOf('[');
    const lastBracket = jsonStr.lastIndexOf(']');

    if (firstBrace !== -1 && lastBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
    } else if (firstBracket !== -1 && lastBracket !== -1) {
      jsonStr = jsonStr.slice(firstBracket, lastBracket + 1);
    }
  }

  if (!jsonStr.startsWith('[') && !jsonStr.startsWith('{')) {
    return null;
  }

  try {
    const rawObj = JSON.parse(jsonStr);
    let parsed = rawObj;
    if (!Array.isArray(parsed) && parsed && typeof parsed === 'object') {
      // Support { questions: [...] } or { data: [...] }
      parsed = parsed.questions || parsed.data || parsed.items || [parsed];
    }
    if (!Array.isArray(parsed)) return null;

    const out: Question[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      let prompt = String(item.prompt || item.question || item.title || '').trim();
      if (!prompt) continue;
      // Strip leading question numbering like "39. ", "1) ", "Question 1: "
      prompt = prompt.replace(/^\s*(?:Q(?:uestion)?\s*)?\d+\s*[.):]\s*/i, '').trim() || prompt;

      let choices: string[] | undefined = undefined;
      if (Array.isArray(item.choices || item.options)) {
        choices = (item.choices || item.options).map((c: any) => String(c).trim());
      }

      let kind: Question['kind'] = item.kind || item.type || 'text';
      if (choices && choices.length >= 2) {
        kind = 'choice';
      }

      let answer = String(item.answer !== undefined ? item.answer : item.correctAnswer || item.correct || '').trim();

      if (kind === 'choice' && choices && choices.length > 0) {
        // Exact choice text match
        const exactIdx = choices.findIndex((c) => c === answer);
        if (exactIdx >= 0) {
          answer = String(exactIdx);
        } else {
          // Case-insensitive choice match
          const caseIdx = choices.findIndex((c) => c.toLowerCase() === answer.toLowerCase());
          if (caseIdx >= 0) {
            answer = String(caseIdx);
          } else {
            // If answer is letter A, B, C...
            const letterMatch = answer.match(/^[A-Fa-f]$/);
            if (letterMatch) {
              const idx = letterMatch[0].toUpperCase().charCodeAt(0) - 65;
              answer = String(idx >= 0 && idx < choices.length ? idx : 0);
            } else if (!isNaN(Number(answer)) && Number(answer) >= 0 && Number(answer) < choices.length) {
              answer = String(Math.floor(Number(answer)));
            } else {
              answer = '0';
            }
          }
        }
      } else if (kind !== 'choice' && NUMERIC.test(answer.split('|')[0].trim())) {
        kind = 'number';
      }

      out.push({
        id: newId(),
        prompt,
        kind,
        choices,
        answer,
        points: Math.max(0, Number(item.points) || 1),
        explanation: String(item.explanation || item.solution || '').trim(),
      });
    }

    if (out.length === 0) return null;

    let title: string | undefined = undefined;
    let description: string | undefined = undefined;
    let timeLimitMinutes: number | undefined = undefined;
    let shuffleQuestions: boolean | undefined = undefined;

    if (rawObj && typeof rawObj === 'object' && !Array.isArray(rawObj)) {
      if (rawObj.title) title = String(rawObj.title).trim();
      if (rawObj.description) description = String(rawObj.description).trim();
      if (rawObj.timeLimitMinutes || rawObj.timeLimit || rawObj.duration) {
        timeLimitMinutes = Number(rawObj.timeLimitMinutes || rawObj.timeLimit || rawObj.duration);
      }
      if (rawObj.shuffleQuestions !== undefined) shuffleQuestions = Boolean(rawObj.shuffleQuestions);
    }

    return {
      title,
      description,
      timeLimitMinutes,
      shuffleQuestions,
      questions: out,
    };
  } catch {
    return null;
  }
}

/**
 * Turns pasted text into questions and optional exercise settings (title, time limit, etc.).
 * Supports:
 *   1. JSON format (raw or inside ```json markdown)
 *   2. Google Apps Script (FormApp)
 *   3. Plain text / Markdown quiz format
 */
export function parseExerciseInput(text: string): ParsedExerciseData {
  if (looksLikeAppsScript(text)) return parseAppsScript(text);

  const jsonQs = parseJsonQuestions(text);
  if (jsonQs) return jsonQs;

  let title: string | undefined = undefined;
  let timeLimitMinutes: number | undefined = undefined;
  let shuffleQuestions: boolean | undefined = undefined;

  // Check comments or headers for title & time limit in plain text
  const timeMatch = text.match(/^\s*(?:time(?:limit)?|duration)\s*[:=]\s*(\d+)/im);
  if (timeMatch) timeLimitMinutes = Number(timeMatch[1]);

  const titleMatch = text.match(/^\s*(?:title|exercise|quiz)\s*[:=]\s*(.+)$/im);
  if (titleMatch) title = titleMatch[1].trim();

  const lines = text.replace(/\r/g, '').split('\n');
  const numbered = lines.some((l) => START.test(l));

  const blocks: string[][] = [];
  let cur: string[] | null = null;
  for (const line of lines) {
    if (numbered) {
      if (START.test(line)) {
        cur = [line.replace(START, '')];
        blocks.push(cur);
      } else if (cur) cur.push(line);
    } else if (!line.trim()) {
      cur = null;
    } else {
      if (!cur) {
        cur = [];
        blocks.push(cur);
      }
      cur.push(line);
    }
  }

  const out: Question[] = [];
  for (const block of blocks) {
    const prompt: string[] = [];
    const choices: string[] = [];
    let marked = -1;
    let answer = '';
    let explanation: string[] = [];
    let points = 1;
    let mode: 'prompt' | 'explain' = 'prompt';

    for (const raw of block) {
      const line = raw.trimEnd();
      let m: RegExpMatchArray | null;
      if ((m = line.match(ANSWER))) {
        answer = m[1].trim();
        mode = 'prompt';
      } else if ((m = line.match(EXPLAIN))) {
        explanation = [m[1]];
        mode = 'explain';
      } else if ((m = line.match(POINTS))) {
        points = Number(m[1]);
      } else if ((m = line.match(CHOICE)) && mode === 'prompt' && (choices.length > 0 || m[1].toLowerCase() === 'a')) {
        let c = m[2].trim();
        if (/\*\s*$/.test(c)) {
          c = c.replace(/\*\s*$/, '').trim();
          marked = choices.length;
        }
        choices.push(c);
      } else if (mode === 'explain') {
        explanation.push(line);
      } else {
        prompt.push(line);
      }
    }

    const promptText = prompt.join('\n').trim();
    if (!promptText) continue;

    const q: Question = {
      id: newId(),
      prompt: promptText,
      kind: 'text',
      answer: answer,
      points,
      explanation: explanation.join('\n').trim(),
    };

    if (choices.length >= 2) {
      q.kind = 'choice';
      q.choices = choices;
      let idx = marked;
      const letter = answer.match(/^\(?([A-Fa-f])[.)]?$/);
      if (letter) idx = letter[1].toLowerCase().charCodeAt(0) - 97;
      else if (answer) {
        const byText = choices.findIndex((c) => c.toLowerCase() === answer.toLowerCase());
        if (byText >= 0) idx = byText;
      }
      q.answer = String(idx >= 0 && idx < choices.length ? idx : 0);
      if (idx < 0 || idx >= choices.length) q.aiGenerated = true; // no key found: flag "Check answer"
    } else if (NUMERIC.test(answer.split('|')[0].trim())) {
      q.kind = 'number';
    }
    out.push(q);
  }
  return {
    title,
    timeLimitMinutes,
    shuffleQuestions,
    questions: out,
  };
}

export function parseQuestions(text: string): Question[] {
  return parseExerciseInput(text).questions;
}
