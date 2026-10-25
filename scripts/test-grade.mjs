// Sanity test for the grading logic. Run: npm run test:grade
// Needs Node 22.18+ (imports the TypeScript source directly, no build step).
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// The app imports './grade' without an extension (Next.js style); plain Node needs one.
// So copy the pure modules to a temp folder and add the extensions there.
const lib = new URL('../src/lib/', import.meta.url);
const tmp = mkdtempSync(join(tmpdir(), 'grade-test-'));
cpSync(new URL('grade.ts', lib), join(tmp, 'grade.ts'));
cpSync(new URL('types.ts', lib), join(tmp, 'types.ts'));
writeFileSync(
  join(tmp, 'gradeExercise.ts'),
  readFileSync(new URL('gradeExercise.ts', lib), 'utf8').replace("from './grade'", "from './grade.ts'").replace("from './types'", "from './types.ts'"),
);
const { isCorrect, parseNumber, normalize } = await import(pathToFileURL(join(tmp, 'grade.ts')).href);
const { gradeQuestions } = await import(pathToFileURL(join(tmp, 'gradeExercise.ts')).href);

const cases = [
  // [kind, given, spec, expected]
  ['number', '-5', '-5', true],
  ['number', '−5', '-5', true], // unicode minus
  ['number', '–5', '-5', true], // en dash
  ['number', '0.75', '3/4', true],
  ['number', '3/4', '0.75', true],
  ['number', '6/8', '3/4', true],
  ['number', '1,5', '3/2', true], // decimal comma
  ['number', '3/0', '3/0', true], // not numeric -> string compare
  ['number', '4', '5', false],
  ['number', '', '0', false],
  ['number', 'abc', '5', false],
  ['text', 'x^2', 'x²', true],
  ['text', 'x ≥ 2', 'x>=2', true],
  ['text', 'x>=2', 'x>2|x>=2', true],
  ['text', '√49', 'sqrt49', true],
  ['text', 'X = 4', 'x=4', true],
  ['text', 'x=5', 'x=4', false],
  ['choice', '2', '2', true],
  ['choice', ' 2 ', '2', true],
  ['choice', '1', '2', false],
  ['choice', '', '0', false],
];

let failed = 0;
for (const [kind, given, spec, expected] of cases) {
  const got = isCorrect(kind, given, spec);
  if (got !== expected) {
    failed++;
    console.error(`FAIL ${kind} given=${JSON.stringify(given)} spec=${JSON.stringify(spec)} expected=${expected} got=${got}`);
  }
}
// Whole-sheet grading, including multiple-choice labels and regrade input
const sheet = gradeQuestions(
  [
    { id: 'a', prompt: '', kind: 'number', answer: '3/4', points: 2, explanation: 'e1' },
    { id: 'b', prompt: '', kind: 'choice', answer: '1', choices: ['x', 'y', 'z'], points: 3, explanation: '' },
  ],
  { a: '0.75', b: '2' },
);
assert.equal(sheet.score, 2);
assert.equal(sheet.total, 5);
assert.equal(sheet.details[1].given, 'z'); // label of the chosen option
assert.equal(sheet.details[1].raw, '2');
assert.equal(sheet.details[1].correctAnswer, 'y');
assert.equal(sheet.details[1].correct, false);
assert.equal(parseNumber('3/4'), 0.75);
assert.equal(parseNumber('x'), null);
assert.equal(normalize(' A − B '), 'a-b');

if (failed) process.exit(1);
console.log(`All ${cases.length} grading checks passed.`);
