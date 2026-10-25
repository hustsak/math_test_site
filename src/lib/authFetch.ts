'use client';

import { getAuthClient } from './firebaseClient';

/** POST JSON to an admin-only API route with the teacher's Firebase ID token. */
export async function adminPost<T = any>(path: string, body: unknown): Promise<T> {
  const user = getAuthClient().currentUser;
  if (!user) throw new Error('Please sign in again.');
  const token = await user.getIdToken();
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data as T;
}
