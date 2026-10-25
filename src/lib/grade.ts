/**
 * Answer normalisation and grading. Pure functions, no dependencies,
 * so they run identically on the server and in tests.
 */

export function normalize(input: string): string {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/[−–—]/g, '-')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/≠/g, '!=')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/√/g, 'sqrt')
    .replace(/π/g, 'pi')
    .replace(/\s+/g, '')
    .replace(/,/g, '.');
}

/** Parses "-5", "3.5", "+2", "3/4", "-3/4". Returns null if not a plain number/fraction. */
export function parseNumber(input: string): number | null {
  const s = normalize(input);
  const num = '[+-]?(?:\\d+\\.?\\d*|\\.\\d+)';
  const frac = new RegExp(`^(${num})/(${num})$`);
  const plain = new RegExp(`^${num}$`);
  const m = s.match(frac);
  if (m) {
    const d = parseFloat(m[2]);
    if (d === 0) return null;
    return parseFloat(m[1]) / d;
  }
  if (plain.test(s)) return parseFloat(s);
  return null;
}

function numbersEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
}

export function isCorrect(kind: 'number' | 'text' | 'choice', given: string, answerSpec: string): boolean {
  if (!normalize(given)) return false;
  if (kind === 'choice') return given.trim() === answerSpec.trim();
  const accepted = answerSpec.split('|').map((a) => a.trim()).filter(Boolean);
  for (const acc of accepted) {
    if (kind === 'number') {
      const a = parseNumber(acc);
      const b = parseNumber(given);
      if (a !== null && b !== null) {
        if (numbersEqual(a, b)) return true;
        continue;
      }
    }
    if (normalize(acc) === normalize(given)) return true;
  }
  return false;
}
