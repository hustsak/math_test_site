'use client';

import { useEffect, useState } from 'react';
import type { GradeCodes } from '@/lib/gradeLabels';

// One request per page load, shared by every component that asks
let cache: GradeCodes | null = null;
let inflight: Promise<GradeCodes> | null = null;

function loadGradeCodes(): Promise<GradeCodes> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch('/api/public/grade-codes')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const codes = data?.gradeCodes;
        cache = codes && typeof codes === 'object' ? (codes as GradeCodes) : {};
        return cache;
      })
      .catch(() => {
        inflight = null; // try again next time
        return {} as GradeCodes;
      });
  }
  return inflight;
}

/**
 * Class names -> grade numbers (e.g. { "វិញ្ញាសាពេទ្យ": 30 }). Works on the student pages before
 * the student has typed their name. Uses a small API call, not the Firestore client library,
 * which would add about 100 kB of JavaScript to those pages.
 */
export function useGradeCodes(): GradeCodes {
  const [codes, setCodes] = useState<GradeCodes>(cache || {});
  useEffect(() => {
    let active = true;
    loadGradeCodes().then((c) => {
      if (active) setCodes(c);
    });
    return () => {
      active = false;
    };
  }, []);
  return codes;
}
