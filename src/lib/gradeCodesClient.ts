import { adminPost } from '@/lib/authFetch';
import { missingGradeCodes, type GradeCodes } from '@/lib/gradeLabels';

/**
 * Admin screens call this after loading settings. If a named class (e.g. "វិញ្ញាសាពេទ្យ") has
 * no number yet, the server assigns one and it is returned here; otherwise nothing is sent.
 */
export async function ensureGradeCodes(
  customGrades: Array<number | string>,
  gradeCodes: GradeCodes | undefined | null
): Promise<GradeCodes | null> {
  if (!missingGradeCodes(customGrades, gradeCodes)) return null;
  try {
    const res = await adminPost<{ gradeCodes?: GradeCodes }>('/api/admin/settings', { customGrades });
    return res?.gradeCodes || null;
  } catch {
    return null;
  }
}
