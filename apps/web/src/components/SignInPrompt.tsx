"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  feedCityFromPath,
  metroFromArea,
  type FeedCity,
} from "@bored/shared";
import { useUser } from "@/components/UserProvider";
import { trackAuthMagicLinkRequested } from "@/lib/analytics";
import { readFeedPrefs } from "@/lib/feed-prefs";

type SignInPromptProps = {
  /** Compact inline banner vs stacked form */
  variant?: "inline" | "card";
  returnTo?: string;
  onSent?: () => void;
  onDismiss?: () => void;
};

function resolveAuthCity(
  returnTo: string | undefined,
  pathname: string | null,
): FeedCity | undefined {
  const fromPath =
    feedCityFromPath(returnTo) ?? feedCityFromPath(pathname) ?? null;
  if (fromPath) return fromPath;
  const prefs = readFeedPrefs();
  return prefs ? metroFromArea(prefs.area) : undefined;
}

export function SignInPrompt({
  variant = "inline",
  returnTo,
  onSent,
  onDismiss,
}: SignInPromptProps) {
  const { requestMagicLink } = useUser();
  const pathname = usePathname();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  useEffect(() => {
    if (!onDismiss) return;
    function onPointer(e: MouseEvent) {
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        onDismiss?.();
      }
    }
    // Defer so the click that opened the prompt doesn't immediately close it
    const t = window.setTimeout(() => {
      window.addEventListener("mousedown", onPointer);
    }, 0);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [onDismiss]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    setError(null);
    try {
      const city = resolveAuthCity(returnTo, pathname);
      await requestMagicLink(email.trim(), {
        returnTo: returnTo ?? pathname ?? undefined,
        city,
      });
      trackAuthMagicLinkRequested({ surface: variant });
      setSent(true);
      onSent?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send link");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      ref={rootRef}
      className={`auth-prompt auth-prompt--${variant}${sent ? " auth-prompt--sent" : ""}`}
      role="dialog"
      aria-labelledby={titleId}
    >
      {onDismiss ? (
        <button
          type="button"
          className="auth-prompt__close"
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path
              d="M3 3l8 8M11 3L3 11"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        </button>
      ) : null}

      {sent ? (
        <p id={titleId} className="auth-prompt__copy auth-prompt__copy--sent">
          Check your email for a sign-in link. It expires in 15 minutes.
        </p>
      ) : (
        <form onSubmit={(e) => void submit(e)}>
          <p id={titleId} className="auth-prompt__copy">
            Sign in to keep saves and tastes on all your devices.
          </p>
          <div className="auth-prompt__row">
            <input
              className="auth-prompt__input"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <button
              className="btn primary auth-prompt__submit"
              type="submit"
              disabled={sending}
            >
              {sending ? "Sending…" : "Email me a link"}
            </button>
          </div>
          {error ? <p className="auth-prompt__error">{error}</p> : null}
          {onDismiss ? (
            <button
              type="button"
              className="auth-prompt__skip"
              onClick={onDismiss}
            >
              Not now
            </button>
          ) : null}
        </form>
      )}
    </div>
  );
}
