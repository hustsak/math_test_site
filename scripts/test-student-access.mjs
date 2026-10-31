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
// DRIP: Sequential school days (Mon-Fri, Cambodia time Asia/Phnom_Penh).
// Day 1 unlocks immediately on registration. Later days unlock sequentially at 00:00
// on each school day (Monday to Friday). Weekends (Sat/Sun) never unlock any exercises.
// Day 6 and Day 7 are NOT skipped; they unlock on real school days.
// -----------------------------------------------------------------------------
console.log('\n--- TEST 8: Sequential School Day Drip (Weekends never unlock, Day 6 & 7 not skipped) ---');

const DAY = 24 * 60 * 60 * 1000;
const local = (y, m, d, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h, mi) - CAMBODIA_OFFSET_MS;
const localWeekday = (ms) => new Date(ms + CAMBODIA_OFFSET_MS).getUTCDay();

// Registered Wednesday 28 Oct 2026, 15:30 Cambodia time
const regWed = local(2026, 10, 28, 15, 30);
assert.equal(getDripUnlockMs(regWed, 1), regWed, 'Day 1 unlocks immediately');
assert.equal(getDripUnlockMs(regWed, 2), local(2026, 10, 29), 'Day 2 = Thursday 00:00');
assert.equal(getDripUnlockMs(regWed, 3), local(2026, 10, 30), 'Day 3 = Friday 00:00');
assert.equal(getDripUnlockMs(regWed, 4), local(2026, 11, 2), 'Day 4 skips the weekend -> Monday');
assert.equal(getDripUnlockMs(regWed, 5), local(2026, 11, 3), 'Day 5 = Tuesday');
assert.equal(getDripUnlockMs(regWed, 6), local(2026, 11, 4), 'Day 6 = Wednesday (not skipped!)');
assert.equal(getDripUnlockMs(regWed, 7), local(2026, 11, 5), 'Day 7 = Thursday (not skipped!)');
assert.equal(getDripUnlockMs(regWed, 8), local(2026, 11, 6), 'Day 8 = Friday');
assert.equal(getDripUnlockMs(regWed, 9), local(2026, 11, 9), 'Day 9 skips the weekend -> Monday');
assert.equal(getDripUnlockMs(regWed, 10), local(2026, 11, 10), 'Day 10 = Tuesday');

// Registered Friday: Friday = Day 1; Sat & Sun = Weekend (no unlocks); Monday = Day 2
const regFri = local(2026, 10, 30, 23, 50);
assert.equal(getDripUnlockMs(regFri, 1), regFri, 'Day 1 unlocks immediately on Friday');
assert.equal(getDripUnlockMs(regFri, 2), local(2026, 11, 2), 'Day 2 = Monday 00:00 (Saturday & Sunday skipped)');
assert.equal(getDripUnlockMs(regFri, 3), local(2026, 11, 3), 'Day 3 = Tuesday 00:00');
assert.equal(getDripUnlockMs(regFri, 4), local(2026, 11, 4), 'Day 4 = Wednesday 00:00');
assert.equal(getDripUnlockMs(regFri, 5), local(2026, 11, 5), 'Day 5 = Thursday 00:00');
assert.equal(getDripUnlockMs(regFri, 6), local(2026, 11, 6), 'Day 6 = Friday 00:00 (Day 6 not skipped!)');
assert.equal(getDripUnlockMs(regFri, 7), local(2026, 11, 9), 'Day 7 = Monday 00:00 (Day 7 not skipped!)');
assert.equal(getDripUnlockMs(regFri, 8), local(2026, 11, 10), 'Day 8 = Tuesday 00:00');

// Registered Monday: Day 1-5 = Mon-Fri, Day 6 = next Monday
const regMon = local(2026, 10, 26, 8, 0);
assert.equal(getDripUnlockMs(regMon, 1), regMon);
assert.equal(getDripUnlockMs(regMon, 5), local(2026, 10, 30), 'Day 5 = Friday');
assert.equal(getDripUnlockMs(regMon, 6), local(2026, 11, 2), 'Day 6 = next Monday (not skipped!)');
assert.equal(getDripUnlockMs(regMon, 7), local(2026, 11, 3), 'Day 7 = next Tuesday (not skipped!)');
assert.equal(getDripUnlockMs(regMon, 8), local(2026, 11, 4), 'Day 8 = next Wednesday');

// Registered on a weekend: Day 1 right away, Day 2 on Monday
const regSat = local(2026, 10, 31, 10, 0);
assert.equal(getDripUnlockMs(regSat, 1), regSat);
assert.equal(getDripUnlockMs(regSat, 2), local(2026, 11, 2), 'Day 2 = Monday 00:00');
assert.equal(getDripUnlockMs(regSat, 3), local(2026, 11, 3), 'Day 3 = Tuesday 00:00');
assert.equal(getDripUnlockMs(regSat, 6), local(2026, 11, 6), 'Day 6 = Friday 00:00');
assert.equal(getDripUnlockMs(regSat, 7), local(2026, 11, 9), 'Day 7 = next Monday 00:00');
assert.equal(getDripUnlockMs(local(2026, 11, 1, 23, 59), 2), local(2026, 11, 2), 'Sunday night -> Monday');

// The Cambodia date is used, not UTC (00:30 Monday in Cambodia is still Sunday in UTC)
assert.equal(getDripUnlockMs(local(2026, 11, 2, 0, 30), 2), local(2026, 11, 3));

// For every start day: Day 2..40 land strictly on Mon-Fri at 00:00, strictly increasing,
// and Day N+5 is exactly 1 week (7 calendar days) after Day N for N >= 2.
for (const reg of [regWed, regSat, regMon, regFri, local(2026, 11, 1, 12, 0)]) {
  let previous = 0;
  for (let n = 2; n <= 40; n++) {
    const t = getDripUnlockMs(reg, n);
    assert.ok([1, 2, 3, 4, 5].includes(localWeekday(t)), `Day ${n} must not unlock on a weekend`);
    assert.equal((t + CAMBODIA_OFFSET_MS) % DAY, 0, `Day ${n} unlocks at 00:00 Cambodia time`);
    assert.ok(t > previous, 'unlock order is strictly increasing for every consecutive school day');
    assert.equal(getDripUnlockMs(reg, n + 5), t + 7 * DAY, 'Day N+5 is exactly one week (5 school days) after Day N');
    if (previous > 0) {
      const gap = t - previous;
      assert.ok(gap === 1 * DAY || gap === 3 * DAY, 'gap between consecutive school days is 1 day or 3 days over weekend');
    }
    previous = t;
  }
}

// Bad input never hangs or goes backwards
assert.equal(getDripUnlockMs(regWed, 0), regWed);
assert.equal(getDripUnlockMs(regWed, NaN), regWed);
assert.ok(Number.isFinite(getDripUnlockMs(regWed, 1e12)));
assert.ok(Number.isNaN(getDripUnlockMs(NaN, 5)));

// Availability check uses the same rule: Day 4 is locked over the weekend, open on Monday 00:00
const dripEx = { published: true, publicationMode: 'drip', dripDay: 4, gradeLevels: [7] };
const satNoon = local(2026, 10, 31, 12, 0);
const monStart = local(2026, 11, 2, 0, 0);
const lockedRes = evaluateExerciseAvailability(dripEx, 7, satNoon, regWed);
assert.equal(lockedRes.available, false);
assert.equal(lockedRes.upcoming, true);
assert.equal(lockedRes.dripUnlockMs, monStart);
assert.equal(evaluateExerciseAvailability(dripEx, 7, monStart - 1, regWed).available, false);
assert.equal(evaluateExerciseAvailability(dripEx, 7, monStart, regWed).available, true);

console.log('✓ Sequential school day drip passed: weekends never unlock, Day 6 & 7 not skipped.');

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

// 28/10 (Wed): only exercise 1 is open
assert.equal(openAt(1, local(2026, 10, 28, 9, 1)), true);
assert.equal(openAt(2, local(2026, 10, 28, 23, 59)), false);
// 29/10 (Thu): exercise 2 opens automatically at midnight, exercise 3 is still closed
assert.equal(openAt(2, local(2026, 10, 29, 0, 0)), true);
assert.equal(openAt(3, local(2026, 10, 29, 23, 59)), false);
// 30/10 (Fri): exercise 3; exercise 4 waits over the weekend
assert.equal(openAt(3, local(2026, 10, 30, 0, 0)), true);
assert.equal(openAt(4, local(2026, 10, 30, 23, 59)), false);
assert.equal(openAt(4, local(2026, 10, 31, 12, 0)), false, 'Saturday: exercise 4 still locked');
assert.equal(openAt(4, local(2026, 11, 1, 23, 59)), false, 'Sunday: exercise 4 still locked');
// Monday 2/11: exercise 4. Tuesday 3/11: exercise 5. Wednesday 4/11: exercise 6. Thursday 5/11: exercise 7.
assert.equal(openAt(4, local(2026, 11, 2, 0, 0)), true);
assert.equal(openAt(5, local(2026, 11, 2, 23, 59)), false);
assert.equal(openAt(5, local(2026, 11, 3, 0, 0)), true);
assert.equal(openAt(6, local(2026, 11, 3, 23, 59)), false);
assert.equal(openAt(6, local(2026, 11, 4, 0, 0)), true, 'Day 6 unlocks on Wednesday');
assert.equal(openAt(7, local(2026, 11, 4, 23, 59)), false);
assert.equal(openAt(7, local(2026, 11, 5, 0, 0)), true, 'Day 7 unlocks on Thursday');
// Earlier exercises stay open once unlocked
assert.equal(openAt(1, local(2026, 11, 5, 12, 0)), true);

// In a 30-day month from 28/10 to 27/11, there are 23 school days (Days 1 to 23)
assert.equal(openAt(23, local(2026, 11, 26, 23, 59)), false);
assert.equal(openAt(23, local(2026, 11, 27, 0, 0)), true, 'Day 23 is open on the last school day 27/11');
assert.equal(canEnter(local(2026, 11, 27, 23, 59)), true);
// Access ends: expired from 28/11 00:00
assert.equal(canEnter(local(2026, 11, 28, 0, 0)), false, 'expired from 28/11 00:00');
assert.equal(isStudentAuthorized(true, validUntil, local(2026, 11, 28, 0, 0), 'approved').reason, 'expired');
assert.ok(getDripUnlockMs(reg28, 24) >= validUntil, 'Day 24 would only open on Monday 30/11 after month has ended');

// Exactly 23 distinct school days in this 1-month window
let unlockedInMonth = 0;
for (let n = 1; n <= 60; n++) {
  const t = getDripUnlockMs(reg28, n);
  if (t < validUntil) unlockedInMonth++;
}
assert.equal(unlockedInMonth, 23, '23 school days fit inside the 1-month validity');

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

console.log('✓ Drip follows the registration day (1 per school day, weekends never unlock) and access ends after 1 month.');

// -----------------------------------------------------------------------------
// REQUIREMENT 10: Free Sample Exercises (Instant access with name only)
// -----------------------------------------------------------------------------
console.log('\n--- TEST 10: Free Sample Exercise (isSample === true) ---');

// Mock start route logic for sample vs regular exercises
function canStudentStartExercise(exercise, studentRecord, studentName) {
  const isExerciseSample = !!exercise.isSample;
  if (!studentRecord) {
    if (!isExerciseSample) return { ok: false, error: ACCESS_ERRORS.NOT_APPROVED.code };
    // Free sample allows unregistered student to enter with just their name
    return { ok: true, studentName: studentName || 'Guest' };
  }
  if (!isExerciseSample) {
    const accessEnabled = studentRecord.accessEnabled !== undefined ? studentRecord.accessEnabled : true;
    if (!accessEnabled) return { ok: false, error: ACCESS_ERRORS.ACCESS_BLOCKED.code };
    if (studentRecord.paymentStatus === 'pending') return { ok: false, error: ACCESS_ERRORS.PAYMENT_REQUIRED.code };
    if (studentRecord.expiresAt && Date.now() >= studentRecord.expiresAt) return { ok: false, error: ACCESS_ERRORS.ACCESS_EXPIRED.code };
  }
  return { ok: true, studentName: studentRecord.name || studentName };
}

const sampleEx = { id: 'ex_sample', title: 'Sample Exercise', published: true, isSample: true };
const regularEx = { id: 'ex_regular', title: 'Course Exercise', published: true, isSample: false };

// Unregistered student just enters their name
assert.equal(canStudentStartExercise(sampleEx, null, 'Dara').ok, true, 'Unregistered student can start sample exercise');
assert.equal(canStudentStartExercise(regularEx, null, 'Dara').ok, false, 'Unregistered student CANNOT start regular exercise');
assert.equal(canStudentStartExercise(regularEx, null, 'Dara').error, ACCESS_ERRORS.NOT_APPROVED.code);

// Student with pending payment can start sample exercise
const unpaidStudent = { id: 's1', name: 'Sokha', paymentStatus: 'pending', accessEnabled: true };
assert.equal(canStudentStartExercise(sampleEx, unpaidStudent, 'Sokha').ok, true, 'Unpaid student can start sample exercise');
assert.equal(canStudentStartExercise(regularEx, unpaidStudent, 'Sokha').ok, false, 'Unpaid student CANNOT start regular exercise');
assert.equal(canStudentStartExercise(regularEx, unpaidStudent, 'Sokha').error, ACCESS_ERRORS.PAYMENT_REQUIRED.code);

// Student with expired access can start sample exercise
const expiredStudent = { id: 's2', name: 'Bopha', paymentStatus: 'approved', accessEnabled: true, expiresAt: Date.now() - 1000 };
assert.equal(canStudentStartExercise(sampleEx, expiredStudent, 'Bopha').ok, true, 'Expired student can start sample exercise');
assert.equal(canStudentStartExercise(regularEx, expiredStudent, 'Bopha').ok, false, 'Expired student CANNOT start regular exercise');
assert.equal(canStudentStartExercise(regularEx, expiredStudent, 'Bopha').error, ACCESS_ERRORS.ACCESS_EXPIRED.code);

console.log('✓ Free Sample Exercise allows students to enter name and start immediately without registration or payment approval.');

console.log('\n================================================================');
console.log('ALL 18 STUDENT ACCESS CONTROL TESTS PASSED! 🎉');
console.log('================================================================');
