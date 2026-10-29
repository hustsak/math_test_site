/**
 * Grade numbers and named classes (e.g. "វិញ្ញាសាពេទ្យ").
 *
 * Students, exercises, the student portal and every API only know grade NUMBERS 1-30.
 * A named class is therefore given its own permanent number (its "code") by the server,
 * stored in settings/app as `gradeCodes` ({ "វិញ្ញាសាពេទ្យ": 30 }). Codes are handed out from
 * 30 downwards, are never re-used and never change, so students and exercises that already
 * carry the number keep working. Every screen shows the class NAME instead of the number.
 */

/** Class name -> permanent grade number. */
export type GradeCodes = Record<string, number>;

export const NAMED_GRADE_CODE_MAX = 30;
export const NAMED_GRADE_CODE_MIN = 13;

const nameKey = (s: unknown) => String(s ?? '').trim().toLowerCase();

/** True for 7, "7" and " 12 "; false for names such as "វិញ្ញាសាពេទ្យ". */
export function isNumericGrade(g: unknown): boolean {
  if (typeof g === 'number') return Number.isFinite(g);
  const s = String(g ?? '').trim();
  return s !== '' && Number.isFinite(Number(s));
}

/** The number assigned to a class name, or null when it has none yet. */
export function findGradeCode(name: unknown, codes?: GradeCodes | null): number | null {
  if (!codes) return null;
  const key = nameKey(name);
  for (const [n, c] of Object.entries(codes)) {
    if (nameKey(n) === key && Number.isInteger(c)) return c;
  }
  return null;
}

/** The number stored on students and exercises for an item of the class list. */
export function gradeCode(g: number | string, codes?: GradeCodes | null): number | null {
  if (isNumericGrade(g)) return Number(g);
  return findGradeCode(g, codes);
}

/** The class name behind a grade number, or null for an ordinary numbered grade. */
export function gradeNameForCode(code: number | string, codes?: GradeCodes | null): string | null {
  if (!codes) return null;
  const num = Number(code);
  for (const [n, c] of Object.entries(codes)) {
    if (c === num) return n;
  }
  return null;
}

/** Khmer label: the class name, or "ថ្នាក់ទី 7". */
export function gradeLabelKh(code: number | string, codes?: GradeCodes | null): string {
  return gradeNameForCode(code, codes) ?? `ថ្នាក់ទី ${code}`;
}

/** English label: the class name, or "Grade 7". */
export function gradeLabelEn(code: number | string, codes?: GradeCodes | null): string {
  return gradeNameForCode(code, codes) ?? `Grade ${code}`;
}

/** Both languages: the class name, or "ថ្នាក់ទី 7 (Grade 7)". */
export function gradeLabelBoth(code: number | string, codes?: GradeCodes | null): string {
  return gradeNameForCode(code, codes) ?? `ថ្នាក់ទី ${code} (Grade ${code})`;
}

/** Labels for a list of numbers, e.g. "ថ្នាក់ទី 7, វិញ្ញាសាពេទ្យ" style pieces joined by ", ". */
export function gradeListLabel(codesList: Array<number | string>, codes?: GradeCodes | null, lang: 'KH' | 'EN' = 'KH'): string {
  return codesList
    .map((c) => (lang === 'KH' ? gradeLabelKh(c, codes) : gradeLabelEn(c, codes)))
    .join(', ');
}

/**
 * Gives every named class in `customGrades` a number. Existing assignments are always kept
 * (even for classes that were removed from the list) so a number is never handed out twice.
 */
export function assignGradeCodes(customGrades: Array<number | string>, existing?: GradeCodes | null): GradeCodes {
  const result: GradeCodes = {};
  for (const [n, c] of Object.entries(existing || {})) {
    if (Number.isInteger(c) && c >= 1 && c <= NAMED_GRADE_CODE_MAX) result[n] = c;
  }
  const taken = new Set<number>(Object.values(result));
  for (const item of customGrades) if (isNumericGrade(item)) taken.add(Number(item));

  for (const item of customGrades) {
    if (isNumericGrade(item)) continue;
    const name = String(item).trim();
    if (!name || findGradeCode(name, result) !== null) continue;
    let code = NAMED_GRADE_CODE_MAX;
    while (code >= NAMED_GRADE_CODE_MIN && taken.has(code)) code--;
    if (code < NAMED_GRADE_CODE_MIN) continue; // no free number left
    result[name] = code;
    taken.add(code);
  }
  return result;
}

/** A numbered grade in the list that is already the permanent number of a named class. */
export function findGradeCodeConflict(
  customGrades: Array<number | string>,
  codes?: GradeCodes | null
): { grade: number; name: string } | null {
  for (const item of customGrades) {
    if (!isNumericGrade(item)) continue;
    const name = gradeNameForCode(Number(item), codes);
    if (name) return { grade: Number(item), name };
  }
  return null;
}

/** True when some named class in the list has no number yet. */
export function missingGradeCodes(customGrades: Array<number | string>, codes?: GradeCodes | null): boolean {
  return customGrades.some((g) => !isNumericGrade(g) && findGradeCode(g, codes) === null);
}
