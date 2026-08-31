"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

type Props = {
  open: boolean;
  children: ReactNode;
  className?: string;
  id?: string;
  role?: string;
  "aria-label"?: string;
};

/**
 * Height + fade reveal (Apple-like): expands with grid 0fr→1fr so the page
 * reflows smoothly instead of popping content in.
 */
export function WeatherReveal({
  open,
  children,
  className = "",
  id,
  role,
  "aria-label": ariaLabel,
}: Props) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => setShown(true));
      });
      return () => cancelAnimationFrame(frame);
    }

    setShown(false);
    const node = rootRef.current;
    if (!node) {
      setMounted(false);
      return;
    }

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setMounted(false);
    };

    const onEnd = (e: TransitionEvent) => {
      if (e.target !== node) return;
      if (
        e.propertyName !== "grid-template-rows" &&
        e.propertyName !== "opacity"
      ) {
        return;
      }
      finish();
    };

    node.addEventListener("transitionend", onEnd);
    const fallback = window.setTimeout(finish, 560);
    return () => {
      node.removeEventListener("transitionend", onEnd);
      window.clearTimeout(fallback);
    };
  }, [open]);

  if (!mounted) return null;

  return (
    <div
      ref={rootRef}
      id={id}
      role={role}
      aria-label={ariaLabel}
      aria-hidden={!shown}
      className={[
        "weather-reveal",
        shown ? "is-open" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="weather-reveal__clip">
        <div className="weather-reveal__content">{children}</div>
      </div>
    </div>
  );
}

/** Soft enter for widgets that mount once data arrives. */
export function WeatherFadeIn({
  children,
  className = "",
  style,
  delayMs = 0,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  delayMs?: number;
  "aria-label"?: string;
}) {
  return (
    <div
      className={["weather-fade-in", className].filter(Boolean).join(" ")}
      aria-label={ariaLabel}
      style={{
        ...style,
        ["--weather-delay" as string]: `${delayMs}ms`,
      }}
    >
      {children}
    </div>
  );
}
