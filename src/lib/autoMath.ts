/**
 * Turns plain typed math into LaTeX, so nobody has to write $...$ for simple things:
 *   3*4 -> 3 × 4      x^2 -> x²      3/4 -> a fraction      sqrt(49) -> √49
 *   x>=2 -> x ≥ 2     x!=2 -> x ≠ 2  2^(n+1) -> 2 to the power n+1
 * Pure functions with no dependencies, so they are easy to test.
 */

export type Piece = { type: 'text' | 'math'; value: string };

// One "math token": a number, a single letter (never part of a word), sqrt(...), pi, lim, oo, inf, or an operator.
const TOKEN = String.raw`(?:\d+(?:\.\d+)?|(?<![A-Za-z])[A-Za-z](?![A-Za-z])|sqrt\([^()]*\)|(?<![A-Za-z])(?:pi|lim|oo|inf)(?![A-Za-z])|->|→|>=|<=|!=|[()+\-*/^=<>≤≥≠×÷−√π_])`;
const RUN = new RegExp(`${TOKEN}(?:[ ]?${TOKEN})*`, 'g');

// A run only counts as math if it contains an operator (so a lone "a" or "5" stays plain text)...
const TRIGGER = /[*^/=<>≤≥≠×÷+]|sqrt|√|->|→|lim/;
// ...and at least one number or letter.
const HAS_OPERAND = /[0-9A-Za-zπ]/;

const NUM = String.raw`\d+(?:\.\d+)?`;
const OPERAND = String.raw`(?:\\sqrt\{[^{}]*\}|${NUM}|(?<![A-Za-z\\])[A-Za-z](?![A-Za-z{])|\([^()]*\))(?:\^(?:-?${NUM}|[A-Za-z]|\([^()]*\)))?`;
const FRAC = new RegExp(`(${OPERAND})\\s*\\/\\s*(${OPERAND})`, 'g');

const stripParens = (s: string) => (s.startsWith('(') && s.endsWith(')') ? s.slice(1, -1) : s);

/** Converts one plain-math run (e.g. "x^2+3*4") to LaTeX. */
export function toLatex(run: string): string {
  let s = run.replace(/−/g, '-');

  // arrows and infinity
  s = s.replace(/->|→/g, '\\to ');
  s = s.replace(/(?<![A-Za-z\\])(?:oo|inf|infinity)(?![A-Za-z])/g, '\\infty ');

  // limits: lim_{...}, lim_(...), lim(x->...)
  s = s.replace(
    /(?<![A-Za-z\\])lim(?:\s*(?:_|\^)\s*(?:\{([^{}]*)\}|\(([^()]*)\)|([A-Za-z0-9+\-]+))|\s*\(([^()]*)\))?/g,
    (_m, g1, g2, g3, g4) => {
      const sub = g1 || g2 || g3 || g4;
      return sub ? `\\lim\\limits_{${toLatex(sub).trim()}}` : '\\lim\\limits ';
    },
  );

  // sqrt(...) and √x first, so fractions can use them as operands
  s = s.replace(/sqrt\(([^()]*)\)/g, '\\sqrt{$1}');
  s = s.replace(/√\s*(\d+(?:\.\d+)?|[A-Za-z])/g, '\\sqrt{$1}');

  // fractions: 3/4, x/2, (a+b)/c
  s = s.replace(FRAC, (_m, a: string, b: string) => `\\frac{${stripParens(a)}}{${stripParens(b)}}`);

  // comparison and multiplication symbols
  s = s.replace(/>=|≥/g, '\\geq ').replace(/<=|≤/g, '\\leq ').replace(/!=|≠/g, '\\neq ');
  s = s.replace(/\*|×/g, '\\times ').replace(/÷/g, '\\div ');
  s = s.replace(/(?<![A-Za-z\\])pi(?![A-Za-z])|π/g, '\\pi ');

  // exponents: x^2, x^-2, x^n, x^(n+1)
  s = s.replace(/\^\s*(-?\d+(?:\.\d+)?|[A-Za-z]|\([^()]*\))/g, (_m, e: string) => `^{${stripParens(e)}}`);

  return s;
}

/** Splits plain text into normal text and auto-detected math pieces. */
export function splitAutoMath(text: string): Piece[] {
  const out: Piece[] = [];
  const push = (type: Piece['type'], value: string) => {
    if (!value) return;
    const prev = out[out.length - 1];
    if (prev && prev.type === 'text' && type === 'text') prev.value += value;
    else out.push({ type, value });
  };

  let last = 0;
  for (const m of text.matchAll(RUN)) {
    let run = m[0];
    let a = m.index ?? 0;
    let b = a + run.length;

    // keep list markers like "1) " and stray ")" as normal text
    const lead = run.match(/^(?:\d+\)\s*|[\s)]+)/)?.[0] ?? '';
    a += lead.length;
    run = run.slice(lead.length);
    // keep trailing "(" "-" and spaces as normal text
    const tail = run.match(/[\s(\-]+$/)?.[0] ?? '';
    b -= tail.length;
    run = run.slice(0, run.length - tail.length);

    if (!run || !TRIGGER.test(run) || !HAS_OPERAND.test(run)) continue;

    push('text', text.slice(last, a));
    push('math', run);
    last = b;
  }
  push('text', text.slice(last));
  return out;
}
