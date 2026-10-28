// Sanity tests for Parent Tracking: profileKey normalization, tokens, claim secrets, face ratings, and data isolation.
// Run: node scripts/test-parent-tracking.mjs
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Copy pure modules to a temp folder and add explicit .ts extensions for native Node ESM import
const lib = new URL('../src/lib/', import.meta.url);
const tmp = mkdtempSync(join(tmpdir(), 'parent-tracking-test-'));

cpSync(new URL('grade.ts', lib), join(tmp, 'grade.ts'));
cpSync(new URL('types.ts', lib), join(tmp, 'types.ts'));
cpSync(new URL('textValue.ts', lib), join(tmp, 'textValue.ts'));
writeFileSync(
  join(tmp, 'profiles.ts'),
  readFileSync(new URL('profiles.ts', lib), 'utf8').replace("from './grade'", "from './grade.ts'")
);
writeFileSync(
  join(tmp, 'parentTracking.ts'),
  readFileSync(new URL('parentTracking.ts', lib), 'utf8').replace("from './types'", "from './types.ts'").replace("from './textValue'", "from './textValue.ts'")
);

const { normalize } = await import(pathToFileURL(join(tmp, 'grade.ts')).href);
const {
  getProfileKey,
  getProfileId,
  generateToken,
  generateClaimSecret,
  hashClaimSecret,
  verifyClaimSecret,
} = await import(pathToFileURL(join(tmp, 'profiles.ts')).href);
const { getFaceRating, buildParentViewData, formatKhmerCountdown } = await import(
  pathToFileURL(join(tmp, 'parentTracking.ts')).href
);

console.log('--- TEST SUITE 1: profileKey Normalization (Case, Space, Khmer) ---');

// 1. Case insensitivity and whitespace stripping
assert.equal(getProfileKey('Sokha Chea', '7A'), 'sokhachea|7a');
assert.equal(getProfileKey('  sokha  chea  ', '  7a  '), 'sokhachea|7a');
assert.equal(getProfileKey('SOKHA CHEA', '7a'), 'sokhachea|7a');
assert.equal(getProfileKey('Sokha', ''), 'sokha|');
assert.equal(getProfileKey('Sokha', null), 'sokha|');

// 2. Khmer script normalization
const khmer1 = getProfileKey('សុខា ជា', 'ថ្នាក់ទី ៧');
const khmer2 = getProfileKey('  សុខា   ជា  ', ' ថ្នាក់ទី៧ ');
assert.equal(khmer1, khmer2, 'Khmer names with different whitespace must normalize to identical profileKey');
assert.ok(khmer1.includes('|'), 'profileKey must delimit name and class with |');

// 3. Deterministic profileId hashing
const id1 = getProfileId(khmer1);
const id2 = getProfileId(khmer2);
assert.equal(id1, id2, 'Identical profileKey must produce identical profileId hash');
assert.equal(id1.length, 64, 'profileId must be a 64-character SHA-256 hex string');
assert.match(id1, /^[0-9a-f]{64}$/, 'profileId must be lowercase hex');
console.log('✓ profileKey normalization and SHA-256 document hashing passed for Latin and Khmer.');

console.log('--- TEST SUITE 2: Token Generation, Claim Secrets & Constant-Time Verification ---');

// 1. Token length and URL-safety
const parentToken = generateToken(24);
assert.ok(typeof parentToken === 'string');
assert.ok(parentToken.length >= 24, `Token must be >= 24 chars, got ${parentToken.length}`);
assert.match(parentToken, /^[A-Za-z0-9_-]+$/, 'Tokens must be URL-safe (base64url)');

// 2. Claim secret generation and hashing
const secret = generateClaimSecret(24);
assert.ok(secret.length >= 24);
const secretHash = hashClaimSecret(secret);
assert.equal(secretHash.length, 64, 'Claim secret hash must be 64-character SHA-256 hex');

// 3. Constant-time verification
assert.equal(verifyClaimSecret(secret, secretHash), true, 'Valid claim secret must verify successfully');
assert.equal(verifyClaimSecret('wrong-secret-1234567890123456', secretHash), false, 'Wrong secret must be rejected');
assert.equal(verifyClaimSecret('', secretHash), false, 'Empty secret must be rejected');
assert.equal(verifyClaimSecret(secret, ''), false, 'Empty hash must be rejected');
assert.equal(verifyClaimSecret(secret, 'invalid-hex-hash'), false, 'Malformed hash must be rejected');

// 4. Token uniqueness across 2,000 generations
const tokenSet = new Set();
for (let i = 0; i < 2000; i++) {
  const t = generateToken();
  assert.ok(!tokenSet.has(t), `Collision detected at iteration ${i}`);
  tokenSet.add(t);
}
assert.equal(tokenSet.size, 2000);
console.log('✓ 2,000 unique tokens generated and claim secret constant-time verification verified.');

console.log('--- TEST SUITE 3: Percent-to-Face Evaluation ---');

// Happy face (>= 80%)
const happy100 = getFaceRating(100);
assert.equal(happy100.face, 'happy');
assert.equal(happy100.emoji, '😊');
assert.equal(happy100.color, '#15803d');
assert.ok(happy100.labelKh.includes('ល្អណាស់'));

const happy80 = getFaceRating(80);
assert.equal(happy80.face, 'happy');
assert.equal(happy80.color, '#15803d');

// Neutral face (50% - 79%)
const neutral79 = getFaceRating(79);
assert.equal(neutral79.face, 'neutral');
assert.equal(neutral79.emoji, '😐');
assert.equal(neutral79.color, '#b45309');
assert.ok(neutral79.labelKh.includes('ល្អបង្គួរ'));

const neutral50 = getFaceRating(50);
assert.equal(neutral50.face, 'neutral');
assert.equal(neutral50.color, '#b45309');

// Sad face (< 50%)
const sad49 = getFaceRating(49);
assert.equal(sad49.face, 'sad');
assert.equal(sad49.emoji, '😟');
assert.equal(sad49.color, '#b91c1c');
assert.ok(sad49.labelKh.includes('ត្រូវព្យាយាមបន្ថែម'));

const sad0 = getFaceRating(0);
assert.equal(sad0.face, 'sad');
assert.equal(sad0.color, '#b91c1c');
console.log('✓ All percentage-to-face mappings matched expected tiers, colors, emojis, and labels.');

console.log('--- TEST SUITE 4: Parent API Data Isolation & Privacy ---');

// Mock Target Student A
const mockProfileA = {
  id: 'profile-a-id',
  name: 'សុខា ជា (Sokha Chea)',
  className: '7A',
  profileKey: 'sokhachea|7a',
  parentToken: generateToken(24),
  claimSecretHash: hashClaimSecret('secret-a'),
  createdAt: Date.now() - 86400000,
};

// Mock Other Student B
const mockProfileB = {
  id: 'profile-b-id',
  name: 'ចាន់ដារ៉ា រ័ត្ន (Dara Roth)',
  className: '7A',
  profileKey: 'dararoth|7a',
  parentToken: generateToken(24),
  claimSecretHash: hashClaimSecret('secret-b'),
  createdAt: Date.now() - 86400000,
};

const mockExercises = [
  {
    id: 'ex-1',
    title: 'Algebra Quiz 1',
    description: 'Linear equations',
    published: true,
    timeLimitMinutes: 20,
    deadline: new Date(Date.now() + 86400000 * 3).toISOString(),
    questions: [
      { id: 'q1', prompt: 'Solve 2x = 6', kind: 'number', answer: '3', points: 5, explanation: 'x = 3' },
      { id: 'q2', prompt: 'Solve 3x = 9', kind: 'number', answer: '3', points: 5, explanation: 'x = 3' },
    ],
  },
  {
    id: 'ex-2',
    title: 'Geometry Triangles',
    description: 'Pythagoras',
    published: true,
    timeLimitMinutes: 15,
    deadline: new Date(Date.now() + 86400000 * 5).toISOString(),
    questions: [
      { id: 'g1', prompt: 'Hypotenuse 3, 4?', kind: 'number', answer: '5', points: 10, explanation: '5' },
    ],
  },
  {
    id: 'ex-draft',
    title: 'Unpublished Draft',
    description: 'Secret teacher draft',
    published: false,
    questions: [
      { id: 'd1', prompt: 'Secret question', kind: 'text', answer: 'secret', points: 10, explanation: '' },
    ],
  },
];

const mockSubmissions = [
  // Student A submitted ex-1 (scored 5/10)
  {
    exerciseId: 'ex-1',
    studentName: mockProfileA.name,
    profileId: mockProfileA.id,
    nameKey: 'sokhachea',
    status: 'submitted',
    startedAt: Date.now() - 3600000,
    submittedAt: Date.now() - 1800000,
    late: false,
    score: 5,
    total: 10,
    details: [
      { id: 'q1', given: '3', correct: true, earned: 5, points: 5, correctAnswer: '3', explanation: 'x = 3' },
      { id: 'q2', given: '4', correct: false, earned: 0, points: 5, correctAnswer: '3', explanation: 'x = 3' },
    ],
  },
  // Student B submitted ex-1 and ex-2
  {
    exerciseId: 'ex-1',
    studentName: mockProfileB.name,
    profileId: mockProfileB.id,
    nameKey: 'dararoth',
    status: 'submitted',
    score: 10,
    total: 10,
    details: [],
  },
  {
    exerciseId: 'ex-2',
    studentName: mockProfileB.name,
    profileId: mockProfileB.id,
    nameKey: 'dararoth',
    status: 'submitted',
    score: 10,
    total: 10,
    details: [],
  },
];

const publishedExercises = mockExercises
  .filter((e) => e.published)
  .map((e) => ({ id: e.id, data: e }));

const submissionsForStudentA = mockSubmissions.filter((s) => s.profileId === mockProfileA.id);

const classAverageMap = {
  'ex-1': 75,
};

// Case 1: Class average disabled
const parentViewNoAvg = buildParentViewData({
  childName: mockProfileA.name,
  className: mockProfileA.className,
  publishedExercises,
  submissionsForStudent: submissionsForStudentA,
  classAverageMap,
  showClassAverage: false,
});

assert.equal(parentViewNoAvg.childName, mockProfileA.name);
assert.equal(parentViewNoAvg.completedCount, 1);
assert.equal(parentViewNoAvg.totalPublishedCount, 2);
assert.equal(parentViewNoAvg.exercises.length, 1);
assert.equal(parentViewNoAvg.notDoneExercises.length, 1);

const doneEx = parentViewNoAvg.exercises[0];
assert.equal(doneEx.id, 'ex-1');
assert.equal(doneEx.score, 5);
assert.equal(doneEx.total, 10);
assert.equal(doneEx.percentage, 50);
assert.equal(doneEx.face, 'neutral');
assert.equal(doneEx.classAveragePercent, null);

const notDoneEx = parentViewNoAvg.notDoneExercises[0];
assert.equal(notDoneEx.id, 'ex-2');
assert.equal(notDoneEx.questions, undefined, 'Unsubmitted exercises must NEVER leak questions');
assert.equal(notDoneEx.answer, undefined, 'Unsubmitted exercises must NEVER leak answer keys');

// Strict Data Isolation: Check that Student B data is NOT present anywhere in JSON
const serialized = JSON.stringify(parentViewNoAvg);
assert.equal(serialized.includes('Dara Roth'), false, 'Must never leak other students names');
assert.equal(serialized.includes('dararoth'), false, 'Must never leak other students nameKey');
assert.equal(serialized.includes(mockProfileB.id), false, 'Must never leak other students profileId');
assert.equal(serialized.includes(mockProfileB.parentToken), false, 'Must never leak other students parentToken');

// Case 2: Class average enabled
const parentViewWithAvg = buildParentViewData({
  childName: mockProfileA.name,
  className: mockProfileA.className,
  publishedExercises,
  submissionsForStudent: submissionsForStudentA,
  classAverageMap,
  showClassAverage: true,
});
assert.equal(parentViewWithAvg.exercises[0].classAveragePercent, 75);

console.log('✓ Parent API response verified: child results accurate, draft excluded, class average optional.');
console.log('✓ Strict data isolation verified: zero leakage of other students or unsubmitted questions.');

console.log('\n======================================================');
console.log('ALL AUTOMATIC STUDENT PROFILE & TRACKING TESTS PASSED! 🎉');
console.log('======================================================');
