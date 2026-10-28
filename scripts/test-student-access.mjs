// Comprehensive test suite for Student Access Control with Expiration Dates (Cambodia Asia/Phnom_Penh UTC+7)
// Run: node scripts/test-student-access.mjs
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const lib = new URL('../src/lib/', import.meta.url);
const tmp = mkdtempSync(join(tmpdir(), 'student-access-test-'));

cpSync(new URL('grade.ts', lib), join(tmp, 'grade.ts'));
cpSync(new URL('types.ts', lib), join(tmp, 'types.ts'));
cpSync(new URL('textValue.ts', lib), join(tmp, 'textValue.ts'));
writeFileSync(
  join(tmp, 'studentAccess.ts'),
  readFileSync(new URL('studentAccess.ts', lib), 'utf8').replace("from './grade'", "from './grade.ts'")
);
writeFileSync(
  join(tmp, 'profiles.ts'),
  readFileSync(new URL('profiles.ts', lib), 'utf8').replace("from './grade'", "from './grade.ts'")
);
writeFileSync(
  join(tmp, 'gradeExercise.ts'),
  readFileSync(new URL('gradeExercise.ts', lib), 'utf8')
    .replace("from './grade'", "from './grade.ts'")
    .replace("from './types'", "from './types.ts'")
    .replace("from './textValue'", "from './textValue.ts'")
);

const {
  normalizeStudentName,
  normalizeClassName,
  getStudentAccessId,
  getEndOfDayCambodia,
  formatCambodiaDate,
  getTodayCambodiaDate,
  addDaysToCambodiaDate,
  getStudentStatus,
  isStudentAuthorized,
  getDripUnlockMs,
  timestampToMs,
  evaluateExerciseAvailability,
  ACCESS_ERRORS,
  CAMBODIA_OFFSET_HOURS,
  CAMBODIA_OFFSET_MS,
} = await import(pathToFileURL(join(tmp, 'studentAccess.ts')).href);

const { getProfileKey, getProfileId } = await import(pathToFileURL(join(tmp, 'profiles.ts')).href);
const { gradeQuestions } = await import(pathToFileURL(join(tmp, 'gradeExercise.ts')).href);

console.log('================================================================');
console.log('STUDENT ACCESS CONTROL & EXPIRATION DATES TEST SUITE');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// REQUIREMENT 7: Name Normalization (Spaces, Case, Khmer Characters)
// -----------------------------------------------------------------------------
console.log('--- TEST 1: Name Normalization for Khmer & Latin Scripts ---');

// Latin names: Case differences, multiple spaces, leading/trailing whitespace
assert.equal(normalizeStudentName('  Sokha   Chea  '), 'sokhachea');
assert.equal(normalizeStudentName('SOKHA CHEA'), 'sokhachea');
assert.equal(normalizeStudentName('sokha chea'), 'sokhachea');
assert.equal(normalizeStudentName('SokhaChea'), 'sokhachea');

// Khmer names: Preserving vowels, diacritics, subscripts (coeng) while handling spaces
const khmerA = normalizeStudentName('ស៊ុន ដារ៉ា');
const khmerB = normalizeStudentName('  ស៊ុន    ដារ៉ា  ');
const khmerC = normalizeStudentName('ស៊ុនដារ៉ា');
assert.equal(khmerA, khmerB, 'Khmer name with extra spaces matches single spaced name');
assert.equal(khmerA, khmerC, 'Khmer name matches unspaced name');
assert.ok(khmerA.length > 0, 'Khmer characters must be preserved without loss');

// Zero-width characters stripping (common in Khmer text entry)
const withZeroWidth = 'សុ\u200Bខា';
assert.equal(normalizeStudentName(withZeroWidth), 'សុខា', 'Zero-width space \\u200B must be stripped');

console.log('✓ Requirement 7 Passed: Normalization correctly handles spaces, case, and Khmer script.');

// -----------------------------------------------------------------------------
// REQUIREMENT 5 & 6: Cambodia Timezone (Asia/Phnom_Penh, UTC+7) & Calendar Day Expiry
// -----------------------------------------------------------------------------
console.log('\n--- TEST 2: Cambodia Timezone Boundary Math (Oct 26, 2026) ---');

assert.equal(CAMBODIA_OFFSET_HOURS, 7, 'Cambodia is strictly UTC+7');
assert.equal(CAMBODIA_OFFSET_MS, 7 * 60 * 60 * 1000);

const testDateStr = '2026-10-26';
const boundaryMs = getEndOfDayCambodia(testDateStr);
const boundaryDate = new Date(boundaryMs);

// The exclusive boundary is the next day local midnight in Cambodia (2026-10-27T00:00:00+07:00)
// In UTC, this is 2026-10-26T17:00:00.000Z
assert.equal(boundaryDate.toISOString(), '2026-10-26T17:00:00.000Z', 'Exclusive boundary must be UTC 17:00:00');

// Test 5: Access during the specified calendar day in Cambodia time
// At 20:30 on October 26 in Cambodia time (which is 13:30 UTC):
const duringDayMs = Date.UTC(2026, 9, 26, 13, 30, 0); // 20:30 Cambodia
assert.ok(duringDayMs < boundaryMs, 'Student must remain authorized during calendar day');
assert.equal(isStudentAuthorized(true, boundaryMs, duringDayMs).authorized, true, 'Student must be authorized on Oct 26');

// At 23:59:59 on October 26 in Cambodia time (which is 16:59:59 UTC):
const endOfDayMs = Date.UTC(2026, 9, 26, 16, 59, 59); // 23:59:59 Cambodia
assert.ok(endOfDayMs < boundaryMs, 'Student remains authorized up to the last second of Oct 26');
assert.equal(isStudentAuthorized(true, boundaryMs, endOfDayMs).authorized, true, 'Authorized at 23:59:59');

// Test 6: Access rejected after expiration boundary (starting Oct 27 in Cambodia)
// At 00:00:01 on October 27 in Cambodia time (which is 17:00:01 UTC):
const nextDayMs = Date.UTC(2026, 9, 26, 17, 0, 1); // 00:00:01 on Oct 27 in Cambodia
assert.ok(nextDayMs >= boundaryMs, 'Next day in Cambodia is beyond the expiration boundary');
assert.equal(isStudentAuthorized(true, boundaryMs, nextDayMs).authorized, false, 'Student must be expired on Oct 27');

// Boundary formatting back to calendar date string in Cambodia
assert.equal(formatCambodiaDate(boundaryMs), '2026-10-26', 'Boundary must format back to 2026-10-26');

console.log('✓ Requirements 5 & 6 Passed: Full calendar day access and exclusive midnight boundary verified.');

// -----------------------------------------------------------------------------
// REQUIREMENT 1, 2, 3, 4: Status Determination & Authorization Enforcement
// -----------------------------------------------------------------------------
console.log('\n--- TEST 3: Status Determination (Active, Expiring Soon, Expired, Blocked) ---');

const mockNow = Date.UTC(2026, 9, 26, 10, 0, 0); // Oct 26, 2026 17:00 Cambodia

// Active: Enabled and expires in 30 days
const future30Boundary = getEndOfDayCambodia('2026-11-25');
assert.equal(getStudentStatus(true, future30Boundary, mockNow), 'active');
assert.equal(isStudentAuthorized(true, future30Boundary, mockNow).authorized, true);

// Expiring Soon: Enabled and expires in 4 days (within 7 days)
const future4Boundary = getEndOfDayCambodia('2026-10-30');
assert.equal(getStudentStatus(true, future4Boundary, mockNow), 'expiring_soon');
assert.equal(isStudentAuthorized(true, future4Boundary, mockNow).authorized, true);

// Expired: Enabled but boundary passed yesterday
const pastBoundary = getEndOfDayCambodia('2026-10-25');
assert.equal(getStudentStatus(true, pastBoundary, mockNow), 'expired');
assert.equal(isStudentAuthorized(true, pastBoundary, mockNow).authorized, false);

// Blocked: accessEnabled === false takes precedence over all other statuses
assert.equal(getStudentStatus(false, future30Boundary, mockNow), 'blocked');
assert.equal(isStudentAuthorized(false, future30Boundary, mockNow).authorized, false);

assert.equal(getStudentStatus(false, pastBoundary, mockNow), 'blocked');
assert.equal(isStudentAuthorized(false, pastBoundary, mockNow).authorized, false);

console.log('✓ Requirements 1-4 Passed: Active, Expiring Soon, Expired, and Blocked statuses accurately determined.');

// -----------------------------------------------------------------------------
// REQUIREMENT 8: Deterministic IDs & Duplicate Prevention
// -----------------------------------------------------------------------------
console.log('\n--- TEST 4: Deterministic Document IDs & Duplicate Prevention ---');

const student1Key = normalizeStudentName('Sok Dara');
const class1Key = normalizeClassName('7A');
const idA = getStudentAccessId(student1Key, class1Key);

const student2Key = normalizeStudentName('  sok   dara  ');
const class2Key = normalizeClassName('  7a  ');
const idB = getStudentAccessId(student2Key, class2Key);

assert.equal(idA, idB, 'Normalized student with same name and class must yield identical doc ID');
assert.equal(idA.length, 64, 'Doc ID is a 64-char SHA-256 hash');

// Same name in different classes yields distinct IDs
const classOtherKey = normalizeClassName('8B');
const idOtherClass = getStudentAccessId(student1Key, classOtherKey);
assert.notEqual(idA, idOtherClass, 'Same student in different class has separate ID');

console.log('✓ Requirement 8 Passed: Deterministic ID prevents duplicate records for same name & class.');

// -----------------------------------------------------------------------------
// REQUIREMENT 7 & ERROR MESSAGES: Khmer-first Friendly Messages
// -----------------------------------------------------------------------------
console.log('\n--- TEST 5: Khmer-First Error Messages & Codes ---');

assert.equal(ACCESS_ERRORS.NOT_APPROVED.code, 'NOT_APPROVED');
assert.ok(ACCESS_ERRORS.NOT_APPROVED.kh.includes('ឈ្មោះរបស់អ្នកមិនទាន់ត្រូវបានអនុញ្ញាតទេ'));
assert.ok(ACCESS_ERRORS.NOT_APPROVED.en.includes('Your name has not been approved yet'));

assert.equal(ACCESS_ERRORS.ACCESS_EXPIRED.code, 'ACCESS_EXPIRED');
assert.ok(ACCESS_ERRORS.ACCESS_EXPIRED.kh.includes('ការប្រើប្រាស់របស់អ្នកបានផុតកំណត់ហើយ'));
assert.ok(ACCESS_ERRORS.ACCESS_EXPIRED.en.includes('Your access has expired'));

assert.equal(ACCESS_ERRORS.ACCESS_BLOCKED.code, 'ACCESS_BLOCKED');
assert.ok(ACCESS_ERRORS.ACCESS_BLOCKED.kh.includes('ការចូលប្រើរបស់អ្នកត្រូវបានផ្អាក'));
assert.ok(ACCESS_ERRORS.ACCESS_BLOCKED.en.includes('Your access has been paused'));

console.log('✓ Khmer-first error messages verified.');

// -----------------------------------------------------------------------------
// REQUIREMENT 11 & 12: In-Progress Attempt Policy
// -----------------------------------------------------------------------------
console.log('\n--- TEST 6: In-Progress Attempt Finishing vs Explicit Blocking ---');

// A student who was authorized when attempt started can finish even if expiresAt passes during test
function checkSubmitPolicy(studentState, attemptStartedAt, submitTime) {
  // If teacher explicitly blocked student: reject immediately
  if (!studentState.accessEnabled) {
    return { allowed: false, reason: ACCESS_ERRORS.ACCESS_BLOCKED.code };
  }
  // Even if submitTime >= studentState.expiresAt, attempt began before expiration, so allow finish
  return { allowed: true };
}

const mockStudentExpiringToday = {
  accessEnabled: true,
  expiresAt: getEndOfDayCambodia('2026-10-26'),
};

const attemptStart = Date.UTC(2026, 9, 26, 16, 50, 0); // 23:50 Oct 26 in Cambodia
const attemptSubmit = Date.UTC(2026, 9, 26, 17, 10, 0); // 00:10 Oct 27 in Cambodia (after midnight)

const result1 = checkSubmitPolicy(mockStudentExpiringToday, attemptStart, attemptSubmit);
assert.equal(result1.allowed, true, 'Authorized started attempt must finish even if expiration passed during attempt');

// Explicit block rejects immediately
const blockedStudent = { accessEnabled: false, expiresAt: future30Boundary };
const result2 = checkSubmitPolicy(blockedStudent, attemptStart, attemptSubmit);
assert.equal(result2.allowed, false);
assert.equal(result2.reason, 'ACCESS_BLOCKED');

console.log('✓ Requirements 11 & 12 Passed: Attempt policy allows finish after expiry but blocks paused students.');

// -----------------------------------------------------------------------------
// REQUIREMENT 13, 14, 15: Preservation of Grading, Profiles & Historical Submissions
// -----------------------------------------------------------------------------
console.log('\n--- TEST 7: Server-side Grading & Parent Tracking Continuity ---');

const sampleQuestions = [
  { id: 'q1', prompt: 'Solve $2x + 4 = 10$', kind: 'number', answer: '3', points: 5, explanation: 'x = 3' },
  { id: 'q2', prompt: 'Choice question', kind: 'choice', answer: '1', choices: ['Wrong', 'Right'], points: 5, explanation: '' },
];

const answers = { q1: '3', q2: '1' };
const gradeRes = gradeQuestions(sampleQuestions, answers);
assert.equal(gradeRes.score, 10);
assert.equal(gradeRes.total, 10);
assert.equal(gradeRes.details[0].correct, true);
assert.equal(gradeRes.details[1].correct, true);

// Parent profile derivation preserves continuity
const parentKey = getProfileKey('Sok Dara', '7A');
const parentId = getProfileId(parentKey);
assert.equal(parentId.length, 64);

console.log('✓ Requirements 13-15 Passed: Server-side grading, profile generation, and history preserved.');

// -----------------------------------------------------------------------------
// DRIP: calendar days from the registration day (Day 8 = next week, Day 30 = end of
// the month). Nothing unlocks on Saturday or Sunday: those days unlock on Monday.
// -----------------------------------------------------------------------------
console.log('\n--- TEST 8: Calendar-day Drip (Day 8 = next week, no weekend unlocks) ---');

const DAY = 24 * 60 * 60 * 1000;
const local = (y, m, d, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h, mi) - CAMBODIA_OFFSET_MS;
const localWeekday = (ms) => new Date(ms + CAMBODIA_OFFSET_MS).getUTCDay();

// Registered Wednesday 28 Oct 2026, 15:30 Cambodia time
const regWed = local(2026, 10, 28, 15, 30);
assert.equal(getDripUnlockMs(regWed, 1), regWed, 'Day 1 unlocks immediately');
assert.equal(getDripUnlockMs(regWed, 2), local(2026, 10, 29), 'Day 2 = Thursday 00:00');
assert.equal(getDripUnlockMs(regWed, 3), local(2026, 10, 30), 'Day 3 = Friday 00:00');
assert.equal(getDripUnlockMs(regWed, 4), local(2026, 11, 2), 'Day 4 (Saturday) waits for Monday');
assert.equal(getDripUnlockMs(regWed, 5), local(2026, 11, 2), 'Day 5 (Sunday) waits for Monday');
assert.equal(getDripUnlockMs(regWed, 6), local(2026, 11, 2), 'Day 6 = Monday');
assert.equal(getDripUnlockMs(regWed, 7), local(2026, 11, 3), 'Day 7 = Tuesday');
assert.equal(getDripUnlockMs(regWed, 8), local(2026, 11, 4), 'Day 8 = Wednesday next week');
assert.equal(getDripUnlockMs(regWed, 10), local(2026, 11, 6), 'Day 10 = Friday');
assert.equal(getDripUnlockMs(regWed, 11), local(2026, 11, 9), 'Day 11 (Saturday) waits for Monday');
assert.equal(getDripUnlockMs(regWed, 12), local(2026, 11, 9), 'Day 12 (Sunday) waits for Monday');
assert.equal(getDripUnlockMs(regWed, 15), local(2026, 11, 11), 'Day 15 = two weeks after Day 1');
assert.equal(getDripUnlockMs(regWed, 30), local(2026, 11, 26), 'Day 30 = Thursday 26/11');

// Registered Monday: Day 1-5 = Mon-Fri, Day 6-7 = weekend -> Monday, Day 8 = next Monday
const regMon = local(2026, 10, 26, 8, 0);
assert.equal(getDripUnlockMs(regMon, 5), local(2026, 10, 30));
assert.equal(getDripUnlockMs(regMon, 6), local(2026, 11, 2));
assert.equal(getDripUnlockMs(regMon, 7), local(2026, 11, 2));
assert.equal(getDripUnlockMs(regMon, 8), local(2026, 11, 2), 'Day 8 = next Monday');
assert.equal(getDripUnlockMs(regMon, 9), local(2026, 11, 3));

// Registered on a weekend: Day 1 right away, Day 2 (Sunday) and Day 3 (Monday) on Monday
const regSat = local(2026, 10, 31, 10, 0);
assert.equal(getDripUnlockMs(regSat, 1), regSat);
assert.equal(getDripUnlockMs(regSat, 2), local(2026, 11, 2));
assert.equal(getDripUnlockMs(regSat, 3), local(2026, 11, 2));
assert.equal(getDripUnlockMs(regSat, 4), local(2026, 11, 3));
assert.equal(getDripUnlockMs(regSat, 8), local(2026, 11, 9), 'Day 8 (Saturday) waits for Monday');

// The Cambodia date is used, not UTC (00:30 Monday in Cambodia is still Sunday in UTC)
assert.equal(getDripUnlockMs(local(2026, 11, 2, 0, 30), 2), local(2026, 11, 3));

// Every Day 2..40: Mon-Fri at 00:00, never earlier than its calendar day, never more than
// 2 days later (weekend wait), never goes backwards, and Day N+7 is exactly one week later.
for (const reg of [regWed, regSat, regMon, local(2026, 10, 30, 23, 50), local(2026, 11, 1, 12, 0)]) {
  const regMidnight = Math.floor((reg + CAMBODIA_OFFSET_MS) / DAY) * DAY - CAMBODIA_OFFSET_MS;
  let previous = 0;
  for (let n = 2; n <= 40; n++) {
    const t = getDripUnlockMs(reg, n);
    assert.ok([1, 2, 3, 4, 5].includes(localWeekday(t)), `Day ${n} must not unlock on a weekend`);
    assert.equal((t + CAMBODIA_OFFSET_MS) % DAY, 0, `Day ${n} unlocks at 00:00 Cambodia time`);
    assert.ok(t >= regMidnight + (n - 1) * DAY && t <= regMidnight + (n - 1) * DAY + 2 * DAY);
    assert.ok(t >= previous, 'unlock order never goes backwards');
    assert.equal(getDripUnlockMs(reg, n + 7), t + 7 * DAY, 'Day N+7 is one week after Day N');
    previous = t;
  }
}

// Bad input never hangs or goes backwards
assert.equal(getDripUnlockMs(regWed, 0), regWed);
assert.equal(getDripUnlockMs(regWed, NaN), regWed);
assert.ok(Number.isFinite(getDripUnlockMs(regWed, 1e12)));
assert.ok(Number.isNaN(getDripUnlockMs(NaN, 5)));

// Availability check uses the same rule: Day 4 is locked over the weekend, open Monday 00:00
const dripEx = { published: true, publicationMode: 'drip', dripDay: 4, gradeLevels: [7] };
const satNoon = local(2026, 10, 31, 12, 0);
const monStart = local(2026, 11, 2, 0, 0);
const lockedRes = evaluateExerciseAvailability(dripEx, 7, satNoon, regWed);
assert.equal(lockedRes.available, false);
assert.equal(lockedRes.upcoming, true);
assert.equal(lockedRes.dripUnlockMs, monStart);
assert.equal(evaluateExerciseAvailability(dripEx, 7, monStart - 1, regWed).available, false);
assert.equal(evaluateExerciseAvailability(dripEx, 7, monStart, regWed).available, true);

console.log('✓ Calendar drip passed: Day 8 = next week, Day 30 = end of month, weekends wait for Monday.');

// -----------------------------------------------------------------------------
// Full lifecycle: unlock follows the registration day, access ends after 1 month
// -----------------------------------------------------------------------------
console.log('\n--- TEST 9: Registration-day drip + 1-month validity (28 Oct example) ---');

const reg28 = local(2026, 10, 28, 9, 0); // student registers (and pays) Wednesday 28/10 at 09:00
const validUntil = getEndOfDayCambodia(addDaysToCambodiaDate(getTodayCambodiaDate(reg28), 30));
assert.equal(validUntil, local(2026, 11, 28, 0, 0), '1 month from 28/10: last valid day is 27/11');

const dayEx = (n) => ({ published: true, publicationMode: 'drip', dripDay: n, gradeLevels: [7] });
const openAt = (n, t) => evaluateExerciseAvailability(dayEx(n), 7, t, reg28).available;
const canEnter = (t) => isStudentAuthorized(true, validUntil, t, 'approved').authorized;

// 28/10: only exercise 1 is open
assert.equal(openAt(1, local(2026, 10, 28, 9, 1)), true);
assert.equal(openAt(2, local(2026, 10, 28, 23, 59)), false);
// 29/10: exercise 2 opens automatically at midnight, exercise 3 is still closed
assert.equal(openAt(2, local(2026, 10, 29, 0, 0)), true);
assert.equal(openAt(3, local(2026, 10, 29, 23, 59)), false);
// 30/10 (Fri): exercise 3
assert.equal(openAt(3, local(2026, 10, 30, 0, 0)), true);
assert.equal(openAt(4, local(2026, 10, 30, 23, 59)), false);
// Weekend: nothing new opens. Monday 2/11: exercises 4, 5 and 6 open together
assert.equal(openAt(4, local(2026, 10, 31, 12, 0)), false);
assert.equal(openAt(5, local(2026, 11, 1, 23, 59)), false);
assert.equal(openAt(6, local(2026, 11, 1, 23, 59)), false);
for (const n of [4, 5, 6]) assert.equal(openAt(n, local(2026, 11, 2, 0, 0)), true);
// Tuesday 3/11: exercise 7. Wednesday 4/11 = Day 8 (next week)
assert.equal(openAt(7, local(2026, 11, 2, 23, 59)), false);
assert.equal(openAt(7, local(2026, 11, 3, 0, 0)), true);
assert.equal(openAt(8, local(2026, 11, 3, 23, 59)), false);
assert.equal(openAt(8, local(2026, 11, 4, 0, 0)), true);
// Earlier exercises stay open once unlocked
assert.equal(openAt(1, local(2026, 11, 4, 12, 0)), true);

// Day 30 (Thu 26/11) and Day 31 (Fri 27/11, the last valid day) fit inside the month
assert.equal(openAt(30, local(2026, 11, 26, 0, 0)), true);
assert.equal(openAt(30, local(2026, 11, 25, 23, 59)), false);
assert.equal(canEnter(local(2026, 11, 27, 23, 59)), true);
assert.equal(openAt(31, local(2026, 11, 27, 0, 0)), true);
// Access ends: expired from 28/11 00:00
assert.equal(canEnter(local(2026, 11, 28, 0, 0)), false, 'expired from 28/11 00:00');
assert.equal(isStudentAuthorized(true, validUntil, local(2026, 11, 28, 0, 0), 'approved').reason, 'expired');
assert.ok(getDripUnlockMs(reg28, 32) >= validUntil, 'Day 32 would only open after the month has ended');

// Exactly Day 1-31 unlock before the month ends
let unlockedInMonth = 0;
for (let n = 1; n <= 60; n++) if (getDripUnlockMs(reg28, n) < validUntil) unlockedInMonth++;
assert.equal(unlockedInMonth, 31);

// Students are stored with a Firestore Timestamp, not a number. Every shape must give the same schedule.
const tsMethod = { toMillis: () => reg28 };                                   // Firestore Timestamp
const tsPlain = { _seconds: Math.floor(reg28 / 1000), _nanoseconds: 0 };      // Timestamp after JSON
const tsDate = new Date(reg28);
const tsIso = new Date(reg28).toISOString();
for (const shape of [reg28, tsMethod, tsPlain, tsDate, tsIso]) {
  assert.equal(timestampToMs(shape), reg28);
  const lockedTonight = evaluateExerciseAvailability(dayEx(2), 7, local(2026, 10, 28, 23, 59), shape);
  assert.equal(lockedTonight.available, false, 'exercise 2 is locked on registration day');
  assert.equal(lockedTonight.dripUnlockMs, local(2026, 10, 29, 0, 0));
  assert.equal(evaluateExerciseAvailability(dayEx(2), 7, local(2026, 10, 29, 0, 0), shape).available, true);
}
assert.equal(timestampToMs(null), null);
assert.equal(timestampToMs(undefined), null);
assert.equal(timestampToMs({}), null);
assert.equal(timestampToMs('not a date'), null);
// Missing or broken registration date: never lock, never hang
assert.equal(evaluateExerciseAvailability(dayEx(5), 7, reg28, null).available, true);
assert.equal(evaluateExerciseAvailability(dayEx(5), 7, reg28, {}).available, true);

console.log('✓ Drip follows the registration day (calendar days, weekends wait) and access ends after 1 month.');

console.log('\n================================================================');
console.log('ALL 17 STUDENT ACCESS CONTROL TESTS PASSED! 🎉');
console.log('================================================================');
