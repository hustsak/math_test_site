'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { ADMIN_EMAIL, getAuthClient } from './firebaseClient';

/** user === undefined while loading, null when signed out. */
export function useAdmin() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    return onAuthStateChanged(getAuthClient(), (u) => setUser(u));
  }, []);

  const isAdmin = !!user && !!ADMIN_EMAIL && user.email?.toLowerCase() === ADMIN_EMAIL;
  return { user, isAdmin, loading: user === undefined };
}
