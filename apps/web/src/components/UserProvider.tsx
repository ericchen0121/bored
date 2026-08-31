"use client";

import type { SignalInput } from "@bored/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, apiLogout } from "@/lib/api";
import { persistAuthSession, resetToAnonymousIdentity } from "@/lib/user-id";

type MeUser = {
  id: string;
  email: string | null;
  displayName: string | null;
};

type MeResponse = {
  user: MeUser;
  authenticated: boolean;
  onboardingComplete: boolean;
};

type SavedSignal = {
  targetKind: string;
  targetId: string;
  type: string;
};

type UserContextValue = {
  ready: boolean;
  user: MeUser | null;
  authenticated: boolean;
  onboardingComplete: boolean;
  savedKeys: ReadonlySet<string>;
  isSaved: (targetKind: SignalInput["targetKind"], targetId: string) => boolean;
  toggleSaved: (
    targetKind: SignalInput["targetKind"],
    targetId: string,
  ) => Promise<boolean>;
  requestMagicLink: (
    email: string,
    opts?: { returnTo?: string; city?: string },
  ) => Promise<void>;
  completeMagicLink: (
    token: string,
  ) => Promise<{ user: MeUser; returnTo: string | null }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const UserContext = createContext<UserContextValue | null>(null);

function signalKey(
  targetKind: string,
  targetId: string,
  type = "saved",
): string {
  return `${targetKind}:${targetId}:${type}`;
}

function keysFromSignals(signals: SavedSignal[]): Set<string> {
  return new Set(
    signals
      .filter((s) => s.type === "saved" || s.type === "going")
      .map((s) => signalKey(s.targetKind, s.targetId, s.type)),
  );
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<MeUser | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());

  const loadSaved = useCallback(async () => {
    try {
      const data = await api<{ signals: SavedSignal[] }>("/v1/me/saved");
      setSavedKeys(keysFromSignals(data.signals));
    } catch {
      setSavedKeys(new Set());
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const me = await api<MeResponse>("/v1/me");
      setUser(me.user);
      setAuthenticated(Boolean(me.authenticated && me.user.email));
      setOnboardingComplete(me.onboardingComplete);
      await loadSaved();
    } catch {
      setUser(null);
      setAuthenticated(false);
      setSavedKeys(new Set());
    } finally {
      setReady(true);
    }
  }, [loadSaved]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isSaved = useCallback(
    (targetKind: SignalInput["targetKind"], targetId: string) =>
      savedKeys.has(signalKey(targetKind, targetId, "saved")),
    [savedKeys],
  );

  const toggleSaved = useCallback(
    async (targetKind: SignalInput["targetKind"], targetId: string) => {
      const key = signalKey(targetKind, targetId, "saved");
      const currentlySaved = savedKeys.has(key);
      const body: SignalInput = { targetKind, targetId, type: "saved" };

      if (currentlySaved) {
        await api("/v1/me/signals", { method: "DELETE", body: JSON.stringify(body) });
        setSavedKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        return false;
      }

      await api("/v1/me/signals", { method: "POST", body: JSON.stringify(body) });
      setSavedKeys((prev) => new Set(prev).add(key));
      return true;
    },
    [savedKeys],
  );

  const requestMagicLink = useCallback(
    async (email: string, opts?: { returnTo?: string; city?: string }) => {
      await api("/v1/auth/magic-link", {
        method: "POST",
        body: JSON.stringify({
          email,
          returnTo: opts?.returnTo,
          city: opts?.city,
        }),
      });
    },
    [],
  );

  const completeMagicLink = useCallback(
    async (token: string) => {
      const params = new URLSearchParams({ token });
      const result = await api<{
        sessionToken: string;
        user: MeUser;
      }>(`/v1/auth/verify?${params.toString()}`, { skipSession: true });

      persistAuthSession(result.sessionToken, result.user.id);

      const returnTo =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("returnTo")
          : null;

      await refresh();

      return { user: result.user, returnTo };
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    await apiLogout();
    resetToAnonymousIdentity();
    setAuthenticated(false);
    setUser(null);
    setOnboardingComplete(false);
    setSavedKeys(new Set());
    await refresh();
  }, [refresh]);

  const value = useMemo(
    (): UserContextValue => ({
      ready,
      user,
      authenticated,
      onboardingComplete,
      savedKeys,
      isSaved,
      toggleSaved,
      requestMagicLink,
      completeMagicLink,
      signOut,
      refresh,
    }),
    [
      ready,
      user,
      authenticated,
      onboardingComplete,
      savedKeys,
      isSaved,
      toggleSaved,
      requestMagicLink,
      completeMagicLink,
      signOut,
      refresh,
    ],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error("useUser must be used within UserProvider");
  }
  return ctx;
}
