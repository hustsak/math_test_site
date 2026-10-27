import katex from 'katex';
import { splitAutoMath, toLatex } from '@/lib/autoMath';

/**
 * Normalizes LaTeX math input:
 * - Ensures mathematical operators (\lim, \sum, \prod, etc.) use \limits so that indices
 *   and limits are typeset directly underneath / above (standard "real write" handwriting style)
 *   rather than inline side-subscripts.
 * - Supports typing shorthand like "->" or "oo" inside math.
 * - Fixes common AI latex escaping bugs like raw newlines in math, double-escaped backslashes,
 *   \frac followed by raw space instead of brackets, and unspaced operators.
 */
function prepareTex(tex: string): string {
  if (!tex) return '';
  let s = tex.trim();

  // If text contains doubled backslashes from JSON serialization (e.g. \\frac), normalize them
  if (s.includes('\\\\frac') || s.includes('\\\\sqrt') || s.includes('\\\\lim') || s.includes('\\\\times') || s.includes('\\\\pm')) {
    s = s.replace(/\\\\([a-zA-Z]+)/g, '\\$1');
  }

  s = s.replace(/->|→/g, '\\to ');
  s = s.replace(/(?<![A-Za-z\\])(?:oo|inf|infinity)(?![A-Za-z])/g, '\\infty ');
  s = s.replace(/(?<![a-zA-Z\\])lim(?![a-zA-Z])/g, '\\lim');
  s = s.replace(
    /\\(lim|limsup|liminf|max|min|sup|inf|sum|prod)(?!\s*\\(?:limits|nolimits)|[a-zA-Z])/g,
    (_, op) => `\\${op}\\limits`,
  );

  // Normalize loose division or times symbols if inside LaTeX
  s = s.replace(/(?<=\d|\w)\s*\*\s*(?=\d|\w)/g, ' \\times ');

  return s;
}

function render(tex: string, displayMode: boolean) {
  const prepared = prepareTex(tex);
  return katex.renderToString(prepared, { throwOnError: false, displayMode, strict: 'ignore' });
}

/**
 * Normalizes raw text containing LaTeX expressions:
 * Converts \[ ... \] to $$ ... $$ and \( ... \) to $ ... $
 * so AI outputs using standard LaTeX delimiters parse smoothly.
 */
function normalizeMathDelimiters(text: string): string {
  if (!text) return '';
  // Convert \[ ... \] to $$ ... $$
  let s = text.replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$');
  // Convert \( ... \) to $ ... $
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$');
  return s;
}

/**
 * Renders text containing math.
 *  - $$display$$ and \[display\] are treated as display-mode LaTeX.
 *  - $inline$ and \(inline\) are treated as inline LaTeX.
 *  - Everything else is plain text, except simple typed math such as 3*4, x^2, 3/4,
 *    sqrt(49), x>=2, which is detected and rendered automatically.
 * Khmer and other text outside math is left untouched.
 */
export default function MathText({ text }: { text: string }) {
  const normalized = normalizeMathDelimiters(text || '');
  // Matches $$...$$ (including multiline) or $...$ (non-greedy, within line or across math)
  const parts = normalized.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/g);

  return (
    <span className="math-text">
      {parts.map((p, i) => {
        if (!p) return null;
        if (p.startsWith('$$') && p.endsWith('$$') && p.length >= 4) {
          const content = p.slice(2, -2);
          return <span key={i} className="math-display" dangerouslySetInnerHTML={{ __html: render(content, true) }} />;
        }
        if (p.startsWith('$') && p.endsWith('$') && p.length >= 2) {
          const content = p.slice(1, -1);
          return <span key={i} className="math-inline" dangerouslySetInnerHTML={{ __html: render(content, false) }} />;
        }
        return (
          <span key={i}>
            {splitAutoMath(p).map((piece, j) =>
              piece.type === 'math' ? (
                <span key={j} className="math-inline" dangerouslySetInnerHTML={{ __html: render(toLatex(piece.value), false) }} />
              ) : (
                <span key={j}>{piece.value}</span>
              ),
            )}
          </span>
        );
      })}
    </span>
  );
}

