/**
 * Safe conversion of quiz content to display text. Pure functions, no dependencies,
 * so they run identically on the server, in the browser and in tests.
 *
 * Quiz JSON (pasted by teachers or produced by AI) does not always use plain strings.
 * A choice can be an object such as { "id": "A", "text": "5 + 5i" }, and in the same way a
 * prompt or explanation can arrive as an object or an array of lines. Calling String() on
 * those values gives the literal text "[object Object]", so every place that turns content
 * into text goes through toText() instead.
 */

/** Keys that usually hold the human-readable text of an object, most specific first. */
const TEXT_KEYS = [
  'text',
  'value',
  'content',
  'latex',
  'tex',
  'math',
  'label',
  'title',
  'prompt',
  'question',
  'explanation',
  'solution',
  'body',
  'name',
  'html',
  'choice',
  'option',
  'answer',
] as const;

/** Keys that identify an object (never display text on their own when real text exists). */
const ID_KEYS = ['id', 'key', 'letter', 'label'] as const;

const MAX_DEPTH = 4;

/**
 * Turns any value into display text. Strings and numbers are returned as they are
 * (Khmer text and LaTeX are untouched). Objects use their text-like property.
 * Arrays are joined with new lines. Anything unusable becomes '' and never "[object Object]".
 */
export function toText(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (depth >= MAX_DEPTH) return '';

  if (Array.isArray(value)) {
    return value
      .map((v) => toText(v, depth + 1))
      .filter((s) => s !== '')
      .join('\n');
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of TEXT_KEYS) {
      if (key in obj) {
        const s = toText(obj[key], depth + 1);
        if (s !== '') return s;
      }
    }
    // Unknown shape: use the first string/number field that is not an identifier.
    for (const [k, v] of Object.entries(obj)) {
      if ((ID_KEYS as readonly string[]).includes(k)) continue;
      if (typeof v === 'string' || typeof v === 'number') {
        const s = String(v);
        if (s !== '') return s;
      }
    }
    return '';
  }

  // Functions, symbols and anything else are never rendered.
  return '';
}

/**
 * The short identifier of a choice object ({ id: "A" } or { key: "b" }), upper-cased,
 * or null when the choice is a plain string or has no usable id.
 */
export function choiceId(choice: unknown): string | null {
  if (!choice || typeof choice !== 'object' || Array.isArray(choice)) return null;
  const obj = choice as Record<string, unknown>;
  for (const key of ['id', 'key', 'letter', 'label'] as const) {
    const v = obj[key];
    if (typeof v === 'string' || typeof v === 'number') {
      const s = String(v).trim().replace(/[.)]$/, '');
      if (/^[A-Za-z0-9]{1,3}$/.test(s)) return s.toUpperCase();
    }
  }
  return null;
}

/** Label shown in front of a choice: 0 -> "A", 1 -> "B", ... (falls back to numbers after Z). */
export function choiceLabel(index: number): string {
  return index >= 0 && index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}

/**
 * Removes a leading "A." / "A)" / "(A)" from the choice text when it repeats the choice's own
 * label, so the screen shows "A. 5 + 5i" and not "A. A. 5 + 5i". Display only; stored text is untouched.
 */
export function stripChoiceLabel(text: string, index: number): string {
  const label = choiceLabel(index);
  const re = new RegExp(`^\\s*\\(?${label}[.)]\\s+`, 'i');
  const stripped = text.replace(re, '');
  return stripped.trim() === '' ? text : stripped;
}

/**
 * Finds the index of the choice that an answer value points at, or -1.
 * The answer may be a choice id/letter ("A" or { id: "A" }), a 0-based index, or the choice text.
 */
export function resolveChoiceIndex(answer: unknown, rawChoices: unknown[]): number {
  const texts = rawChoices.map((c) => toText(c).trim());
  const ids = rawChoices.map((c) => choiceId(c));
  const answerText = toText(answer).trim();

  // 1. By id: the answer is { id: "B" } or the letter "B" and the choices carry ids.
  const answerId = choiceId(answer) ?? (/^[A-Za-z0-9]{1,3}$/.test(answerText) ? answerText.toUpperCase() : null);
  if (answerId) {
    const byId = ids.findIndex((id) => id === answerId);
    if (byId >= 0) return byId;
  }
  // 2. By exact text, then case-insensitive text.
  if (answerText) {
    const exact = texts.findIndex((t) => t === answerText);
    if (exact >= 0) return exact;
    const loose = texts.findIndex((t) => t.toLowerCase() === answerText.toLowerCase());
    if (loose >= 0) return loose;
  }
  // 3. By letter position (A -> 0, B -> 1) when the choices have no ids.
  const letter = answerText.match(/^[A-Fa-f]$/);
  if (letter) {
    const idx = letter[0].toUpperCase().charCodeAt(0) - 65;
    if (idx < rawChoices.length) return idx;
  }
  // 4. By 0-based numeric index.
  if (answerText !== '' && !isNaN(Number(answerText))) {
    const n = Math.floor(Number(answerText));
    if (n >= 0 && n < rawChoices.length) return n;
  }
  return -1;
}
