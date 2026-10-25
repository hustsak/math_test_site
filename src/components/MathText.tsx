import katex from 'katex';

function render(tex: string, displayMode: boolean) {
  return katex.renderToString(tex, { throwOnError: false, displayMode, strict: 'ignore' });
}

/**
 * Renders text containing LaTeX: $inline$ and $$display$$.
 * Everything outside the dollar signs is plain text (Khmer works fine).
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
        return <span key={i}>{p}</span>;
      })}
    </div>
  );
}
