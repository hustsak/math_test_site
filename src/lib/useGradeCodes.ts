'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { getDb } from '@/lib/firebaseClient';
import type { GradeCodes } from '@/lib/gradeLabels';

/**
 * Class names -> grade numbers (e.g. { "វិញ្ញាសាពេទ្យ": 30 }) from settings/app.
 * That document is publicly readable (the register page reads it too), so this also
 * works on the student pages before the student has typed their name.
 */
export function useGradeCodes(): GradeCodes {
  const [codes, setCodes] = useState<GradeCodes>({});
  useEffect(() => {
    let active = true;
    getDoc(doc(getDb(), 'settings', 'app'))
      .then((snap) => {
        if (!active || !snap.exists()) return;
        const c = snap.data()?.gradeCodes;
        if (c && typeof c === 'object') setCodes(c as GradeCodes);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return codes;
}
