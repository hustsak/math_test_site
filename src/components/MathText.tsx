import katex from 'katex';
import { splitAutoMath, toLatex } from '@/lib/autoMath';

/**
 * Normalizes LaTeX math input:
 * - Ensures mathematical operators (\lim, \sum, \prod, etc.) use \limits so that indices
 *   and limits are typeset directly underneath / above (standard "real write" handwriting style)
 *   rather than inline side-subscripts.
 * - Supports typing shorthand like "->" or "oo" inside math.
 */
function prepareTex(tex: string): string {
  if (!tex) return '';
  let s = tex;
  s = s.replace(/->|→/g, '\\to ');
  s = s.replace(/(?<![A-Za-z\\])(?:oo|inf|infinity)(?![A-Za-z])/g, '\\infty ');
  s = s.replace(/(?<![a-zA-Z\\])lim(?![a-zA-Z])/g, '\\lim');
  s = s.replace(
    /\\(lim|limsup|liminf|max|min|sup|inf|sum|prod)(?!\s*\\(?:limits|nolimits)|[a-zA-Z])/g,
    (_, op) => `\\${op}\\limits`,
  );
  return s;
}

function render(tex: string, displayMode: boolean) {
  const prepared = prepareTex(tex);
  return katex.renderToString(prepared, { throwOnError: false, displayMode, strict: 'ignore' });
}

/**
 * Renders text containing math.
 *  - $inline$ and $$display$$ are treated as LaTeX.
 *  - Everything else is plain text, except simple typed math such as 3*4, x^2, 3/4,
 *    sqrt(49), x>=2, which is detected and rendered automatically.
 * Khmer and other text outside math is left untouched.
 */
export default function MathText({ text }: { text: string }) {
  const parts = (text || '').split(/(\$\$[^$]+\$\$|\$[^$]+\$)/g);
  return (
    <div className="math-text">
      {parts.map((p, i) => {
        if (p.startsWith('$$') && p.endsWith('$$') && p.length > 4) {
          return <span key={i} dangerouslySetInnerHTML={{ __html: render(p.slice(2, -2), true) }} />;
        }
        if (p.startsWith('$') && p.endsWith('$') && p.length > 2) {
          return <span key={i} dangerouslySetInnerHTML={{ __html: render(p.slice(1, -1), false) }} />;
        }
        return (
          <span key={i}>
            {splitAutoMath(p).map((piece, j) =>
              piece.type === 'math' ? (
                <span key={j} dangerouslySetInnerHTML={{ __html: render(toLatex(piece.value), false) }} />
              ) : (
                <span key={j}>{piece.value}</span>
              ),
            )}
          </span>
        );
      })}
    </div>
  );
}
