// Regression test for the "[object Object]" quiz bug (choices given as { id, text } objects).
// Run: npm run test:choices
// Needs Node 22.18+ (imports the TypeScript source directly, no build step).
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// The app imports './x' without an extension (Next.js style); plain Node needs one.
// So copy the pure modules to a temp folder and add the extensions there.
const lib = new URL('../src/lib/', import.meta.url);
const tmp = mkdtempSync(join(tmpdir(), 'choices-test-'));
const withExt = (name) =>
  readFileSync(new URL(name, lib), 'utf8')
    .replace("from './grade'", "from './grade.ts'")
    .replace("from './types'", "from './types.ts'")
    .replace("from './textValue'", "from './textValue.ts'");
for (const f of ['types.ts', 'grade.ts', 'textValue.ts']) cpSync(new URL(f, lib), join(tmp, f));
for (const f of ['gradeExercise.ts', 'parseQuestions.ts']) writeFileSync(join(tmp, f), withExt(f));

const load = (f) => import(pathToFileURL(join(tmp, f)).href);
const { toText, choiceId, choiceLabel, stripChoiceLabel, resolveChoiceIndex } = await load('textValue.ts');
const { parseExerciseInput } = await load('parseQuestions.ts');
const { gradeQuestions } = await load('gradeExercise.ts');

const BAD = '[object Object]';

/** Fails if any string anywhere inside `value` contains "[object Object]". */
function assertNoObjectText(value, path = 'value') {
  if (typeof value === 'string') {
    assert.ok(!value.includes(BAD), `${path} contains ${BAD}: ${JSON.stringify(value)}`);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoObjectText(v, `${path}[${i}]`));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) assertNoObjectText(v, `${path}.${k}`);
  }
}

// ---------------------------------------------------------------- toText / labels
assert.equal(toText('5 + 5i'), '5 + 5i');
assert.equal(toText({ id: 'A', text: '5 + 5i' }), '5 + 5i');
assert.equal(toText({ id: 'B', label: 'B', value: '$x^2$' }), '$x^2$'); // value beats label
assert.equal(toText({ id: 'C', label: 'ប្រាំ' }), 'ប្រាំ'); // Khmer untouched
assert.equal(toText({ text: { text: 'nested' } }), 'nested');
assert.equal(toText(['line 1', { text: 'line 2' }]), 'line 1\nline 2');
assert.equal(toText(7), '7');
assert.equal(toText(0), '0');
assert.equal(toText(null), '');
assert.equal(toText(undefined), '');
assert.equal(toText({}), '');
assert.equal(toText({ id: 'A' }), ''); // an id alone is not display text
assert.equal(toText({ foo: 'bar' }), 'bar'); // unknown shape: first plain field
assert.ok(!toText({ a: { b: { c: { d: { e: {} } } } } }).includes(BAD));
const circular = {};
circular.self = circular;
assert.ok(!toText(circular).includes(BAD)); // depth-limited, no crash

assert.equal(choiceId({ id: 'a', text: 'x' }), 'A');
assert.equal(choiceId({ key: 'B.' }), 'B');
assert.equal(choiceId('A'), null);
assert.equal(choiceId({ text: 'x' }), null);

assert.deepEqual([0, 1, 2, 3, 5].map(choiceLabel), ['A', 'B', 'C', 'D', 'F']);
assert.equal(choiceLabel(26), '27');
assert.equal(stripChoiceLabel('A. 5 + 5i', 0), '5 + 5i'); // repeats its own label
assert.equal(stripChoiceLabel('(B) ប្រាំមួយ', 1), 'ប្រាំមួយ');
assert.equal(stripChoiceLabel('B. 7', 0), 'B. 7'); // a different letter is real content
assert.equal(stripChoiceLabel('A.', 0), 'A.'); // never strips to nothing
assert.equal(stripChoiceLabel('5 + 5i', 0), '5 + 5i');

// ---------------------------------------------------------------- resolveChoiceIndex
const objChoices = [
  { id: 'A', text: '5 + 5i' },
  { id: 'B', text: '6 + 6i' },
  { id: 'C', text: '5 - 5i' },
];
assert.equal(resolveChoiceIndex('B', objChoices), 1); // by id / letter
assert.equal(resolveChoiceIndex({ id: 'C', text: '5 - 5i' }, objChoices), 2); // answer given as the object
assert.equal(resolveChoiceIndex('6 + 6i', objChoices), 1); // by text
assert.equal(resolveChoiceIndex('c', ['x', 'y', 'z']), 2); // letter position, plain strings
assert.equal(resolveChoiceIndex('1', ['x', 'y', 'z']), 1); // 0-based index
assert.equal(resolveChoiceIndex('2', ['1', '2', '3']), 1); // exact text wins over index (unchanged behaviour)
assert.equal(resolveChoiceIndex('nope', objChoices), -1);

// ---------------------------------------------------------------- a multi-question quiz
// Mixes object choices, plain choices, object prompt/explanation, Khmer and LaTeX.
const quizJson = JSON.stringify({
  title: 'ចំនួនកុំផ្លិច និងប្រភាគ',
  description: { text: 'តេស្តគណិតវិទ្យា — Math test' },
  questions: [
    {
      question: 'គណនា $(2+3i)+(3+2i)$',
      choices: [
        { id: 'A', text: '5 + 5i' },
        { id: 'B', text: '6 + 6i' },
        { id: 'C', text: '5 - 5i' },
        { id: 'D', text: '1 + i' },
      ],
      answer: 'A', // by id
      points: 2,
      explanation: 'ផលបូក $= 5+5i$',
    },
    {
      prompt: { text: 'តើ $\\frac{1}{2}+\\frac{1}{3}$ ស្មើប៉ុន្មាន?' }, // object prompt
      choices: [
        { id: 'A', text: '$\\frac{2}{5}$' },
        { id: 'B', text: '$\\frac{5}{6}$' },
        { id: 'C', text: '$\\frac{1}{6}$' },
      ],
      answer: { id: 'B', text: '$\\frac{5}{6}$' }, // answer given as an object
      explanation: { text: 'ភាគបែងរួម $6$៖ $\\frac{3}{6}+\\frac{2}{6}=\\frac{5}{6}$' }, // object explanation
    },
    {
      prompt: 'ជ្រើសរើសចម្លើយត្រឹមត្រូវ៖ $3 \\times 4$',
      choices: ['10', '12', '14', '16'], // plain strings, unchanged behaviour
      answer: '12', // by text
    },
    {
      prompt: 'ដេរីវេនៃ $x^2$ គឺ?',
      options: [
        { label: 'A', value: '$x$' },
        { label: 'B', value: '$2x$' },
        { label: 'C', value: '$x^2$' },
      ],
      answer: '$2x$', // by text, key is "options"
      explanation: ['ជំហានទី ១៖ ប្រើរូបមន្ត', { text: '$(x^n)\' = n x^{n-1}$' }], // array explanation
    },
    {
      prompt: 'ជ្រើសរើស',
      choices: ['A. ប្រាំ', 'B. ប្រាំមួយ', 'C. ប្រាំពីរ'], // labels already inside the text
      answer: 'B',
    },
    { prompt: 'គណនា 3*4', answer: '12', points: 1 }, // number
    { prompt: 'ឈ្មោះរាជធានីនៃកម្ពុជា?', answer: 'ភ្នំពេញ', explanation: 'ភ្នំពេញ' }, // text
  ],
});

const parsed = parseExerciseInput(quizJson);
assert.equal(parsed.questions.length, 7);
assert.equal(parsed.title, 'ចំនួនកុំផ្លិច និងប្រភាគ');
assert.equal(parsed.description, 'តេស្តគណិតវិទ្យា — Math test');
assertNoObjectText(parsed, 'parsed');

const qs = parsed.questions;
// Choice text is the object's text property, never the object.
assert.deepEqual(qs[0].choices, ['5 + 5i', '6 + 6i', '5 - 5i', '1 + i']);
assert.deepEqual(qs[1].choices, ['$\\frac{2}{5}$', '$\\frac{5}{6}$', '$\\frac{1}{6}$']);
assert.deepEqual(qs[3].choices, ['$x$', '$2x$', '$x^2$']);
// Khmer and LaTeX survive untouched.
assert.equal(qs[0].prompt, 'គណនា $(2+3i)+(3+2i)$');
assert.equal(qs[1].prompt, 'តើ $\\frac{1}{2}+\\frac{1}{3}$ ស្មើប៉ុន្មាន?');
assert.equal(qs[1].explanation, 'ភាគបែងរួម $6$៖ $\\frac{3}{6}+\\frac{2}{6}=\\frac{5}{6}$');
assert.equal(qs[3].explanation, "ជំហានទី ១៖ ប្រើរូបមន្ត\n$(x^n)' = n x^{n-1}$");
// The correct answers still point at the right choice (index as string).
assert.deepEqual(qs.slice(0, 5).map((q) => q.answer), ['0', '1', '1', '1', '1']);
assert.deepEqual(qs.slice(0, 5).map((q) => q.kind), ['choice', 'choice', 'choice', 'choice', 'choice']);
assert.equal(qs[5].kind, 'number');
assert.equal(qs[6].kind, 'text');
assert.equal(qs[0].points, 2);

// ---------------------------------------------------------------- scoring & answer validation
const correctSheet = Object.fromEntries(qs.map((q) => [q.id, q.kind === 'choice' ? q.answer : q.answer]));
let g = gradeQuestions(qs, correctSheet);
assertNoObjectText(g, 'grade(correct)');
assert.equal(g.score, g.total);
assert.equal(g.total, 2 + 6); // 2 points + six questions of 1 point
assert.ok(g.details.every((d) => d.correct));
assert.equal(g.details[0].given, '5 + 5i');
assert.equal(g.details[0].correctAnswer, '5 + 5i');
assert.equal(g.details[1].correctAnswer, '$\\frac{5}{6}$');

// Picking a wrong choice scores 0 and shows that choice's text.
const wrongSheet = { [qs[0].id]: '1', [qs[1].id]: '0', [qs[2].id]: '0', [qs[3].id]: '2', [qs[4].id]: '0' };
g = gradeQuestions(qs, wrongSheet);
assertNoObjectText(g, 'grade(wrong)');
assert.equal(g.details[0].correct, false);
assert.equal(g.details[0].earned, 0);
assert.equal(g.details[0].given, '6 + 6i');
assert.equal(g.details[0].correctAnswer, '5 + 5i');
assert.equal(g.details[1].given, '$\\frac{2}{5}$');
assert.equal(g.details[3].given, '$x^2$');
assert.ok(g.details.slice(0, 5).every((d) => !d.correct));

// ---------------------------------------------------------------- data already stored with objects
// Questions saved before this fix may hold choice/explanation/answer objects. Grading and the
// public payload must still produce plain text.
const stored = [
  {
    id: 'legacy1',
    prompt: 'Legacy question',
    kind: 'choice',
    choices: [
      { id: 'A', text: '5 + 5i' },
      { id: 'B', text: '6 + 6i' },
    ],
    answer: '1',
    points: 1,
    explanation: { text: 'ពន្យល់ $6+6i$' },
  },
];
g = gradeQuestions(stored, { legacy1: '1' });
assertNoObjectText(g, 'grade(stored)');
assert.equal(g.score, 1);
assert.equal(g.details[0].given, '6 + 6i');
assert.equal(g.details[0].correctAnswer, '6 + 6i');
assert.equal(g.details[0].explanation, 'ពន្យល់ $6+6i$');

// What /api/exercises/[id] sends to students: choices as plain text, in the same order.
const publicChoices = stored[0].choices.map((c) => toText(c));
assert.deepEqual(publicChoices, ['5 + 5i', '6 + 6i']);
assertNoObjectText(publicChoices, 'publicChoices');

// ---------------------------------------------------------------- string-only quizzes behave as before
const plain = parseExerciseInput(
  JSON.stringify([
    { prompt: 'Q', choices: ['1', '2', '3', '4'], answer: '3' }, // text "3" -> index 2
    { prompt: 'Q', choices: ['x', 'y', 'z'], answer: 'c' }, // letter -> index 2
    { prompt: 'Q', choices: ['x', 'y', 'z'], answer: 'Y' }, // case-insensitive text -> index 1
    { prompt: 'Q', choices: ['x', 'y', 'z'], answer: 'nonsense' }, // unmatched -> first choice
  ]),
).questions;
assert.deepEqual(plain.map((q) => q.answer), ['2', '2', '1', '0']);

console.log('All choice rendering / [object Object] regression checks passed.');
