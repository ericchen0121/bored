"use client";

import { useEffect, useRef, useState } from "react";
import type { SignalInput } from "@bored/shared";
import { SignInPrompt } from "@/components/SignInPrompt";
import { useUser } from "@/components/UserProvider";
import { trackEventSaved, trackEventUnsaved } from "@/lib/analytics";

type SaveButtonProps = {
  targetKind: SignalInput["targetKind"];
  targetId: string;
  returnTo?: string;
  className?: string;
  /** Visible hover/focus tooltip (e.g. reels heart ≠ Instagram like). */
  tooltip?: boolean;
  /** Fires after a successful toggle with the new saved state. */
  onToggled?: (saved: boolean) => void;
};

const AUTH_PROMPT_DISMISS_KEY = "bored:auth-prompt-dismissed";

function wasAuthPromptDismissed(): boolean {
  try {
    return sessionStorage.getItem(AUTH_PROMPT_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberAuthPromptDismissed() {
  try {
    sessionStorage.setItem(AUTH_PROMPT_DISMISS_KEY, "1");
  } catch {
    /* private mode */
  }
}

export function SaveButton({
  targetKind,
  targetId,
  returnTo,
  className,
  tooltip = false,
  onToggled,
}: SaveButtonProps) {
  const { ready, authenticated, isSaved, toggleSaved } = useUser();
  const [busy, setBusy] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anim, setAnim] = useState<"pop" | "pop-out" | null>(null);
  const animClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saved = isSaved(targetKind, targetId);
  const actionLabel = saved ? "Unsave" : "Save";

  useEffect(() => {
    return () => {
      if (animClearRef.current) clearTimeout(animClearRef.current);
    };
  }, []);

  function playAnim(next: "pop" | "pop-out") {
    if (animClearRef.current) clearTimeout(animClearRef.current);
    setAnim(null);
    // Force reflow so re-triggering the same animation restarts
    requestAnimationFrame(() => {
      setAnim(next);
      animClearRef.current = setTimeout(() => setAnim(null), 520);
    });
  }

  function dismissPrompt() {
    rememberAuthPromptDismissed();
    setShowPrompt(false);
  }

  async function onClick() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const nowSaved = await toggleSaved(targetKind, targetId);
      if (nowSaved) {
        playAnim("pop");
        trackEventSaved({ targetKind, targetId });
        if (!authenticated && !wasAuthPromptDismissed()) setShowPrompt(true);
      } else {
        playAnim("pop-out");
        trackEventUnsaved({ targetKind, targetId });
        setShowPrompt(false);
      }
      onToggled?.(nowSaved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`save-heart${tooltip ? " save-heart--tooltip" : ""}${
        className ? ` ${className}` : ""
      }`}
    >
      <button
        type="button"
        className={`save-heart__btn${saved ? " is-saved" : ""}${
          anim === "pop" ? " is-popping" : ""
        }${anim === "pop-out" ? " is-popping-out" : ""}`}
        aria-label={actionLabel}
        aria-pressed={saved}
        disabled={!ready || busy}
        onClick={() => void onClick()}
      >
        <span className="save-heart__burst" aria-hidden>
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
        <svg
          className="save-heart__icon"
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          aria-hidden
        >
          <path
            className="save-heart__path"
            d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {tooltip ? (
          <span className="save-heart__tip" role="tooltip">
            {actionLabel}
          </span>
        ) : null}
      </button>
      {error ? <p className="auth-prompt__error">{error}</p> : null}
      {showPrompt && !authenticated ? (
        <div className="save-heart__prompt">
          <SignInPrompt
            variant="inline"
            returnTo={returnTo}
            onDismiss={dismissPrompt}
          />
        </div>
      ) : null}
    </div>
  );
}
