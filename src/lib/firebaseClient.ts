'use client';

import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Lazy init so pages can be prerendered without Firebase env vars present.
function app() {
  if (getApps().length) return getApp();
  return initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  });
}

export const getAuthClient = () => getAuth(app());
export const getDb = () => getFirestore(app());

export const ADMIN_EMAIL = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || '').trim().toLowerCase();
