// Tests for named classes (e.g. "វិញ្ញាសាពេទ្យ"): each gets a permanent grade number,
// and screens show the name. Run: npm run test:gradelabels
// Needs Node 22.18+ (imports the TypeScript source directly, no build step).
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const lib = new URL('../src/lib/', import.meta.url);
const tmp = mkdtempSync(join(tmpdir(), 'gradelabels-test-'));
cpSync(new URL('gradeLabels.ts', lib), join(tmp, 'gradeLabels.ts'));
const {
  isNumericGrade, findGradeCode, gradeCode, gradeNameForCode, gradeLabelKh, gradeLabelEn,
  gradeLabelBoth, gradeListLabel, assignGradeCodes, findGradeCodeConflict, missingGradeCodes,
} = await import(pathToFileURL(join(tmp, 'gradeLabels.ts')).href);

const MEDICAL = 'វិញ្ញាសាពេទ្យ';
const GRADES = [7, 8, 9, 10, 11, 12, MEDICAL];

// --- numbers vs names
assert.equal(isNumericGrade(7), true);
assert.equal(isNumericGrade('12'), true);
assert.equal(isNumericGrade(MEDICAL), false);
assert.equal(isNumericGrade(''), false);

// --- the bug: a named class used to turn into 7 and share Grade 7's tick box
assert.equal(missingGradeCodes(GRADES, {}), true, 'a named class with no number yet is detected');
const codes = assignGradeCodes(GRADES, {});
assert.deepEqual(codes, { [MEDICAL]: 30 }, 'first named class gets 30');
assert.equal(missingGradeCodes(GRADES, codes), false);
assert.notEqual(gradeCode(MEDICAL, codes), gradeCode(7, codes), 'the medical class is no longer Grade 7');
assert.equal(gradeCode(MEDICAL, codes), 30);
assert.equal(gradeCode(7, codes), 7);
assert.equal(gradeCode('9', codes), 9);
assert.equal(gradeCode('Unknown class', codes), null, 'no silent fallback to 7');

// --- numbers are stable and never reused
const again = assignGradeCodes(GRADES, codes);
assert.deepEqual(again, codes, 'running it again changes nothing');
const two = assignGradeCodes([...GRADES, 'Foundation'], codes);
assert.equal(two[MEDICAL], 30, 'existing number never changes');
assert.equal(two['Foundation'], 29);
const afterRemoval = assignGradeCodes([7, 8, 9, 10, 11, 12], two);
assert.deepEqual(afterRemoval, two, 'a removed class keeps its number so it is never handed out again');
const third = assignGradeCodes([...GRADES, 'Another'], two);
assert.equal(third['Another'], 28, 'a removed class number (29) is not reused');
assert.equal(assignGradeCodes(['  ' + MEDICAL.toUpperCase() + ' '], codes)[MEDICAL], 30, 'matching ignores case and spaces');

// --- a numbered grade already used by a named class is flagged
assert.deepEqual(findGradeCodeConflict([7, 30], codes), { grade: 30, name: MEDICAL });
assert.equal(findGradeCodeConflict([7, 8, 13], codes), null);
// and the numbers of numbered grades are skipped when handing out codes
assert.equal(assignGradeCodes([30, MEDICAL], {})[MEDICAL], 29);

// --- labels
assert.equal(gradeNameForCode(30, codes), MEDICAL);
assert.equal(gradeNameForCode(7, codes), null);
assert.equal(gradeLabelKh(30, codes), MEDICAL);
assert.equal(gradeLabelEn(30, codes), MEDICAL);
assert.equal(gradeLabelBoth(30, codes), MEDICAL);
assert.equal(gradeLabelKh(7, codes), 'ថ្នាក់ទី 7');
assert.equal(gradeLabelEn(7, codes), 'Grade 7');
assert.equal(gradeLabelBoth(7, codes), 'ថ្នាក់ទី 7 (Grade 7)');
assert.equal(gradeLabelBoth('30', codes), MEDICAL, 'string numbers from a URL work too');
assert.equal(gradeListLabel([7, 30], codes, 'KH'), `ថ្នាក់ទី 7, ${MEDICAL}`);
assert.equal(gradeLabelKh(12, undefined), 'ថ្នាក់ទី 12', 'works before settings have loaded');

// --- the exercise only for the medical class (the real goal)
const chosen = [gradeCode(MEDICAL, codes)];
assert.deepEqual(chosen, [30]);
assert.equal(chosen.includes(gradeCode(7, codes)), false, 'Grade 7 students do not match');
assert.equal(chosen.includes(30), true, 'a student enrolled in the medical class matches');

// --- no free number left: the class is simply not offered, never mapped to another grade
const full = {};
const many = Array.from({ length: 20 }, (_, i) => `class-${i}`);
const fullCodes = assignGradeCodes(many, full);
assert.equal(Object.keys(fullCodes).length, 18, 'numbers 13-30 only');
assert.equal(findGradeCode('class-19', fullCodes), null);

console.log('All named class (grade number) checks passed.');
