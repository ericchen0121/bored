"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useUser } from "@/components/UserProvider";

function VerifyInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { completeMagicLink } = useUser();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const token = searchParams.get("token")?.trim();
    if (!token) {
      setError("Missing sign-in link.");
      return;
    }

    let cancelled = false;
    void completeMagicLink(token)
      .then(({ returnTo }) => {
        if (cancelled) return;
        setDone(true);
        router.replace(returnTo && returnTo.startsWith("/") ? returnTo : "/");
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [completeMagicLink, router, searchParams]);

  if (done) {
    return <p className="muted">Signed in — redirecting…</p>;
  }

  if (error) {
    return (
      <div className="auth-verify">
        <h1>Sign-in link expired</h1>
        <p className="muted">{error}</p>
        <p>
          <Link href="/">Back to the feed</Link>
        </p>
      </div>
    );
  }

  return <p className="muted">Signing you in…</p>;
}

export default function AuthVerifyPage() {
  return (
    <main className="auth-verify">
      <Suspense fallback={<p className="muted">Signing you in…</p>}>
        <VerifyInner />
      </Suspense>
    </main>
  );
}
