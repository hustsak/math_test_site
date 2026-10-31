// Checks the site font setup: Khmer OS Siemreap everywhere, nothing bold, math untouched.
// Run: npm run test:fonts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const layout = readFileSync(new URL('../src/app/layout.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');

// The font is served from this site: no request to Google Fonts anywhere (they slow the first paint)
import { statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const srcDir = new URL('../src/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
for (const file of walk(srcDir).filter((f) => /\.(tsx?|css)$/.test(f))) {
  const text = readFileSync(file, 'utf8');
  assert.ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(text), `${file} must not load Google Fonts`);
}
const fontFile = new URL('../public/fonts/siemreap-400.woff2', import.meta.url);
assert.ok(statSync(fontFile).size > 10_000, 'the Siemreap font file is in public/fonts');
assert.ok(statSync(new URL('../public/fonts/OFL.txt', import.meta.url)).size > 500, 'the font license ships with it');
assert.match(css, /@font-face\s*\{[^}]*font-family:\s*'Siemreap'[^}]*url\('\/fonts\/siemreap-400\.woff2'\)[^}]*font-display:\s*swap|@font-face\s*\{[^}]*font-display:\s*swap[^}]*url\('\/fonts\/siemreap-400\.woff2'\)/s, '@font-face points at /fonts');
assert.match(layout, /rel="preload"[\s\S]*?href="\/fonts\/siemreap-400\.woff2"[\s\S]*?as="font"/, 'the font is preloaded');
for (const old of ['Inter', 'Kantumruy', 'Noto+Sans+Khmer']) {
  assert.ok(!layout.includes(old), `layout no longer loads ${old}`);
}

// The font stack starts with Khmer OS Siemreap and is used by the whole page
assert.match(css, /--font-main:\s*'Khmer OS Siemreap',\s*'Siemreap'/, 'font stack starts with Khmer OS Siemreap');
assert.match(css, /font-family:\s*var\(--font-main\)/);

// Smaller text: the root size (almost every size on the site is in rem) is below the 16px default
const root = css.match(/html\s*\{[^}]*font-size:\s*(\d+(?:\.\d+)?)px/);
assert.ok(root, 'html font-size is set');
assert.ok(Number(root[1]) < 16 && Number(root[1]) >= 12, 'text is smaller than default but still readable');

// Every element is forced to the regular weight and the same font, except KaTeX math
const rule = css.match(/body \*:not\(\.katex\):not\(\.katex \*\)\s*\{([^}]*)\}/);
assert.ok(rule, 'global font rule exists and skips .katex');
assert.match(rule[1], /font-family:\s*var\(--font-main\)\s*!important/);
assert.match(rule[1], /font-weight:\s*400\s*!important/, 'nothing is bold');

console.log('Font checks passed: Khmer OS Siemreap everywhere, regular weight only, smaller text, math untouched.');
