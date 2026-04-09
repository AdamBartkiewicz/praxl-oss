"use client";

import { useState, useEffect, useCallback } from "react";

interface User {
  id: string;
  email: string;
  name: string | null;
  imageUrl: string | null;
}

interface AuthState {
  user: User | null;
  isLoaded: boolean;
  isSignedIn: boolean;
}

let cachedUser: User | null = null;
let fetchPromise: Promise<User | null> | null = null;

async function fetchUser(): Promise<User | null> {
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json();
    return data.user || null;
  } catch {
    return null;
  }
}

export function useUser(): AuthState & { mutate: () => void } {
  const [user, setUser] = useState<User | null>(cachedUser);
  const [isLoaded, setIsLoaded] = useState(cachedUser !== null);

  const mutate = useCallback(() => {
    cachedUser = null;
    fetchPromise = null;
    setIsLoaded(false);
    fetchPromise = fetchUser();
    fetchPromise.then((u) => {
      cachedUser = u;
      setUser(u);
      setIsLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (cachedUser !== null) {
      setUser(cachedUser);
      setIsLoaded(true);
      return;
    }

    if (!fetchPromise) {
      fetchPromise = fetchUser();
    }

    fetchPromise.then((u) => {
      cachedUser = u;
      setUser(u);
      setIsLoaded(true);
    });
  }, []);

  return {
    user,
    isLoaded,
    isSignedIn: isLoaded && user !== null,
    mutate,
  };
}

export function useAuth(): { isSignedIn: boolean; isLoaded: boolean; userId: string | null } {
  const { user, isLoaded, isSignedIn } = useUser();
  return { isSignedIn, isLoaded, userId: user?.id ?? null };
}

export async function signOut(): Promise<void> {
  cachedUser = null;
  fetchPromise = null;
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  window.location.href = "/sign-in";
}
