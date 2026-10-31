// The watermark is one repeating SVG tile with the student's name (npm run test:watermark).
// Needs Node 22.18+ (imports the TypeScript source directly).
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = mkdtempSync(join(tmpdir(), 'watermark-test-'));
cpSync(new URL('../src/lib/watermark.ts', import.meta.url), join(tmp, 'watermark.ts'));
const { watermarkBackground, escapeXml } = await import(pathToFileURL(join(tmp, 'watermark.ts')).href);

const decode = (css) => {
  const m = css.match(/^url\("data:image\/svg\+xml,(.*)"\)$/);
  assert.ok(m, 'is a CSS url("data:image/svg+xml,...") value');
  return decodeURIComponent(m[1]);
};

// Khmer name + date, as shown on a real screenshot
const khmer = 'សុខ ដារា · 10/31/2026 09:41';
const svg = decode(watermarkBackground(khmer));
assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'), 'valid SVG');
assert.ok(svg.includes(khmer), 'the name and time are in the tile');
assert.ok(svg.endsWith('</svg>'));

// Tile is sized for the text, never tiny or huge
const [, w, h] = svg.match(/width="(\d+)" height="(\d+)"/).map(Number);
assert.ok(w > 150 && w < 700 && h > 100 && h < 500, `tile ${w}x${h} is a sensible size`);

// A name can never break out of the SVG (XML injection)
assert.equal(escapeXml('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;');
const evil = decode(watermarkBackground('"><script>alert(1)</script>'));
assert.ok(!evil.includes('<script>'), 'markup in a name is escaped');
assert.ok(evil.includes('&lt;script&gt;'));
// ...and it can never close the CSS url("...") either
assert.ok(!watermarkBackground('x") ; background: red; ("').slice(0, -2).includes('")'));

// Very long names are cut so the tile stays small
assert.ok(decode(watermarkBackground('x'.repeat(500))).length < 1500);
assert.doesNotThrow(() => watermarkBackground(undefined));

console.log('Watermark checks passed: one tile, name and time inside, markup-safe.');
