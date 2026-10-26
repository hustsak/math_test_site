// Sanity tests for Parent Tracking: tokens, face rating, and data isolation.
// Run: node scripts/test-parent-tracking.mjs
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Copy pure modules to a temp folder and add explicit .ts extensions for native Node ESM import
const lib = new URL('../src/lib/', import.meta.url);
const tmp = mkdtempSync(join(tmpdir(), 'parent-tracking-test-'));

cpSync(new URL('types.ts', lib), join(tmp, 'types.ts'));
cpSync(new URL('tokens.ts', lib), join(tmp, 'tokens.ts'));
writeFileSync(
  join(tmp, 'parentTracking.ts'),
  readFileSync(new URL('parentTracking.ts', lib), 'utf8')
    .replace("from './types'", "from './types.ts'")
    .replace("from './tokens'", "from './tokens.ts'")
);

const { generateToken, isValidTokenFormat } = await import(pathToFileURL(join(tmp, 'tokens.ts')).href);
const { getFaceRating, buildParentViewData } = await import(pathToFileURL(join(tmp, 'parentTracking.ts')).href);

console.log('--- TEST SUITE 1: Token Generation & Uniqueness ---');

// 1. Token length and URL-safety
const singleToken = generateToken();
assert.ok(typeof singleToken === 'string', 'Token should be a string');
assert.ok(singleToken.length >= 24, `Token length should be >= 24 chars, got ${singleToken.length}`);
assert.match(singleToken, /^[A-Za-z0-9_-]+$/, 'Token must contain only URL-safe characters (base64url)');

// 2. Token format validation
assert.equal(isValidTokenFormat(singleToken), true, 'Generated token should be valid');
assert.equal(isValidTokenFormat(''), false, 'Empty string should be invalid');
assert.equal(isValidTokenFormat('short_token_123'), false, 'Token under 24 chars should be invalid');
assert.equal(isValidTokenFormat('invalid+token/with=special#chars!'), false, 'Token with non-base64url characters should be invalid');

// 3. Uniqueness across 2,000 generated tokens
const tokenSet = new Set();
const GENERATION_COUNT = 2000;
for (let i = 0; i < GENERATION_COUNT; i++) {
  const t = generateToken();
  assert.ok(!tokenSet.has(t), `Duplicate token detected at index ${i}: ${t}`);
  tokenSet.add(t);
}
assert.equal(tokenSet.size, GENERATION_COUNT, `Expected ${GENERATION_COUNT} unique tokens`);

// 4. Student token and Parent token generation difference
const studentToken = generateToken();
const parentToken = generateToken();
assert.notEqual(studentToken, parentToken, 'studentToken and parentToken must be completely distinct');
console.log(`✓ 2,000 tokens generated with 100% uniqueness and valid base64url encoding.`);

console.log('--- TEST SUITE 2: Percent-to-Face Evaluation ---');

// Happy face (>= 80%)
const happy100 = getFaceRating(100);
assert.equal(happy100.face, 'happy');
assert.equal(happy100.emoji, '😊');
assert.equal(happy100.color, '#15803d');
assert.ok(happy100.labelKh.includes('ល្អណាស់'), 'Khmer label should indicate excellence');

const happy80 = getFaceRating(80);
assert.equal(happy80.face, 'happy');
assert.equal(happy80.color, '#15803d');

// Neutral face (50% - 79%)
const neutral79 = getFaceRating(79);
assert.equal(neutral79.face, 'neutral');
assert.equal(neutral79.emoji, '😐');
assert.equal(neutral79.color, '#b45309');
assert.ok(neutral79.labelKh.includes('ល្អបង្គួរ'), 'Khmer label should indicate medium');

const neutral50 = getFaceRating(50);
assert.equal(neutral50.face, 'neutral');
assert.equal(neutral50.color, '#b45309');

// Sad face (< 50%)
const sad49 = getFaceRating(49);
assert.equal(sad49.face, 'sad');
assert.equal(sad49.emoji, '😟');
assert.equal(sad49.color, '#b91c1c');
assert.ok(sad49.labelKh.includes('ត្រូវព្យាយាមបន្ថែម'), 'Khmer label should encourage improvement');

const sad0 = getFaceRating(0);
assert.equal(sad0.face, 'sad');
assert.equal(sad0.color, '#b91c1c');
console.log('✓ All percentage-to-face evaluations matched expected tier, emoji, color, and Khmer descriptions.');

console.log('--- TEST SUITE 3: Parent API Response Shape & Student Data Isolation ---');

// Mock Student A (target child)
const mockStudentA = {
  id: 'student-a-id',
  name: 'សុខា ជា (Sokha Chea)',
  className: 'Grade 9A',
  studentToken: generateToken(),
  parentToken: generateToken(),
  active: true,
  createdAt: new Date().toISOString(),
};

// Mock Student B (another child in the class)
const mockStudentB = {
  id: 'student-b-id',
  name: 'ចាន់ដារ៉ា រ័ត្ន (Dara Roth)',
  className: 'Grade 9A',
  studentToken: generateToken(),
  parentToken: generateToken(),
  active: true,
  createdAt: new Date().toISOString(),
};

// Mock exercises
const mockExercises = [
  {
    id: 'ex-1',
    title: 'Algebra Quiz 1',
    description: 'Linear equations test',
    published: true,
    timeLimitMinutes: 30,
    deadline: new Date(Date.now() + 86400000 * 3).toISOString(),
    shuffleQuestions: false,
    questions: [
      {
        id: 'q1',
        prompt: 'Solve: 2x + 4 = 10',
        kind: 'number',
        answer: '3',
        points: 5,
        explanation: '2x = 6 => x = 3',
      },
      {
        id: 'q2',
        prompt: 'Solve: 3x - 1 = 8',
        kind: 'number',
        answer: '3',
        points: 5,
        explanation: '3x = 9 => x = 3',
      },
    ],
  },
  {
    id: 'ex-2',
    title: 'Geometry Triangles',
    description: 'Pythagorean theorem',
    published: true,
    timeLimitMinutes: 20,
    deadline: new Date(Date.now() + 86400000 * 5).toISOString(),
    shuffleQuestions: false,
    questions: [
      {
        id: 'g1',
        prompt: 'Hypotenuse of 3 and 4?',
        kind: 'number',
        answer: '5',
        points: 10,
        explanation: '3^2 + 4^2 = 25 => sqrt(25) = 5',
      },
    ],
  },
  {
    id: 'ex-draft',
    title: 'Unpublished Draft Exercise',
    description: 'Hidden teacher test',
    published: false, // Teacher draft!
    questions: [
      {
        id: 'd1',
        prompt: 'Hidden prompt',
        kind: 'text',
        answer: 'secret',
        points: 10,
        explanation: 'secret solution',
      },
    ],
  },
];

// Mock submissions
const mockSubmissions = [
  // Student A submitted ex-1
  {
    id: 'sub-a-1',
    exerciseId: 'ex-1',
    studentId: mockStudentA.id,
    studentName: mockStudentA.name,
    nameKey: 'sokhachea',
    status: 'submitted',
    startedAt: new Date(Date.now() - 3600000).toISOString(),
    submittedAt: new Date(Date.now() - 1800000).toISOString(),
    late: false,
    score: 5,
    total: 10,
    details: [
      {
        id: 'q1',
        given: '3',
        raw: '3',
        correct: true,
        earned: 5,
        points: 5,
        correctAnswer: '3',
        explanation: '2x = 6 => x = 3',
      },
      {
        id: 'q2',
        given: '4', // mistake
        raw: '4',
        correct: false,
        earned: 0,
        points: 5,
        correctAnswer: '3',
        explanation: '3x = 9 => x = 3',
      },
    ],
  },
  // Student B submitted ex-1 (scored 10/10)
  {
    id: 'sub-b-1',
    exerciseId: 'ex-1',
    studentId: mockStudentB.id,
    studentName: mockStudentB.name,
    nameKey: 'dararoth',
    status: 'submitted',
    score: 10,
    total: 10,
    details: [],
  },
  // Student B submitted ex-2 (scored 10/10)
  {
    id: 'sub-b-2',
    exerciseId: 'ex-2',
    studentId: mockStudentB.id,
    studentName: mockStudentB.name,
    nameKey: 'dararoth',
    status: 'submitted',
    score: 10,
    total: 10,
    details: [],
  },
];

// Prepare inputs for student A
const publishedExercises = mockExercises
  .filter((e) => e.published)
  .map((e) => ({ id: e.id, data: e }));

const submissionsForStudentA = mockSubmissions.filter((s) => s.studentId === mockStudentA.id);

// Pre-calculated class average percent for ex-1: (50 + 100) / 2 = 75%
const classAverageMap = {
  'ex-1': 75,
};

// Case A: showClassAverage = false
const parentDataNoAvg = buildParentViewData({
  childName: mockStudentA.name,
  className: mockStudentA.className,
  publishedExercises,
  submissionsForStudent: submissionsForStudentA,
  classAverageMap,
  showClassAverage: false,
});

// Verify basic child attributes
assert.equal(parentDataNoAvg.childName, mockStudentA.name);
assert.equal(parentDataNoAvg.className, mockStudentA.className);
assert.equal(parentDataNoAvg.completedCount, 1);
assert.equal(parentDataNoAvg.totalPublishedCount, 2); // Excludes draft
assert.equal(parentDataNoAvg.exercises.length, 1);
assert.equal(parentDataNoAvg.notDoneExercises.length, 1);

// Verify completed exercise data
const doneEx1 = parentDataNoAvg.exercises[0];
assert.equal(doneEx1.id, 'ex-1');
assert.equal(doneEx1.score, 5);
assert.equal(doneEx1.total, 10);
assert.equal(doneEx1.percentage, 50);
assert.equal(doneEx1.face, 'neutral');
assert.equal(doneEx1.questions.length, 2);
assert.equal(doneEx1.questions[0].correct, true);
assert.equal(doneEx1.questions[1].correct, false);
assert.equal(doneEx1.questions[1].childAnswer, '4');
assert.equal(doneEx1.questions[1].correctAnswer, '3');
assert.equal(doneEx1.questions[1].explanation, '3x = 9 => x = 3');

// Verify that class average is null when setting is off
assert.equal(doneEx1.classAveragePercent, null);

// Verify not-done exercise: must NEVER leak questions or answers
const notDoneEx2 = parentDataNoAvg.notDoneExercises[0];
assert.equal(notDoneEx2.id, 'ex-2');
assert.equal(notDoneEx2.title, 'Geometry Triangles');
assert.equal(notDoneEx2.questionCount, 1);
assert.equal(notDoneEx2.questions, undefined, 'Not-done exercise must NOT contain questions array');
assert.equal(notDoneEx2.answer, undefined, 'Not-done exercise must NOT contain answer key');

// Verify Draft exercise is completely absent
const hasDraft = [...parentDataNoAvg.exercises, ...parentDataNoAvg.notDoneExercises].some(
  (e) => e.id === 'ex-draft'
);
assert.equal(hasDraft, false, 'Draft exercise must NOT appear anywhere in parent view data');

// STRICT PRIVACY CHECK: Verify NO mention of Student B anywhere in serialised JSON
const jsonOutput = JSON.stringify(parentDataNoAvg);
assert.equal(jsonOutput.includes('Dara Roth'), false, 'Data must never contain other students names');
assert.equal(jsonOutput.includes('dararoth'), false, 'Data must never contain other students nameKey');
assert.equal(jsonOutput.includes(mockStudentB.id), false, 'Data must never contain other students ID');
assert.equal(jsonOutput.includes(mockStudentB.studentToken), false, 'Data must never contain other students tokens');
assert.equal(jsonOutput.includes(mockStudentB.parentToken), false, 'Data must never contain other parents tokens');

// Case B: showClassAverage = true
const parentDataWithAvg = buildParentViewData({
  childName: mockStudentA.name,
  className: mockStudentA.className,
  publishedExercises,
  submissionsForStudent: submissionsForStudentA,
  classAverageMap,
  showClassAverage: true,
});

// For ex-1: Student A scored 50% (5/10), Student B scored 100% (10/10). Class average is (50 + 100) / 2 = 75%
const doneEx1WithAvg = parentDataWithAvg.exercises[0];
assert.equal(doneEx1WithAvg.classAveragePercent, 75);
console.log('✓ Parent API shape verified: child results accurate, draft excluded, class average optional.');
console.log('✓ Strict data isolation verified: zero leakage of foreign student names, IDs, or tokens.');

console.log('\n========================================');
console.log('ALL PARENT TRACKING UNIT TESTS PASSED! 🎉');
console.log('========================================');
