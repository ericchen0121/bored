"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SignInPrompt } from "@/components/SignInPrompt";
import { useUser } from "@/components/UserProvider";
import { feedHomeHref } from "@/lib/feed-prefs";

export default function AccountPage() {
  const router = useRouter();
  const { ready, authenticated, user, onboardingComplete, signOut } = useUser();
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    document.title = "Account · Bored";
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      router.push(feedHomeHref());
    } finally {
      setSigningOut(false);
    }
  }

  if (!ready) {
    return (
      <main className="account-page">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  if (!authenticated || !user?.email) {
    return (
      <main className="account-page">
        <h1 className="account-page__title">Account</h1>
        <p className="account-page__lede">
          Sign in to sync saves and tastes across devices.
        </p>
        <SignInPrompt variant="card" returnTo="/account" />
        <p className="account-page__back">
          <Link href={feedHomeHref()}>← Back to feed</Link>
        </p>
      </main>
    );
  }

  return (
    <main className="account-page">
      <h1 className="account-page__title">Account</h1>
      <p className="account-page__lede">Signed in as</p>
      <p className="account-page__email">{user.email}</p>

      <ul className="account-page__links">
        <li>
          <Link href="/onboarding">
            {onboardingComplete ? "Edit tastes" : "Set tastes"}
          </Link>
        </li>
        <li>
          <Link href="/saved">Saved</Link>
        </li>
      </ul>

      <p className="account-page__session muted">
        You stay signed in for 30 days on this device, or until you sign out.
      </p>

      <button
        type="button"
        className="account-page__sign-out"
        disabled={signingOut}
        onClick={() => void handleSignOut()}
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </button>

      <p className="account-page__back">
        <Link href={feedHomeHref()}>← Back to feed</Link>
      </p>
    </main>
  );
}
