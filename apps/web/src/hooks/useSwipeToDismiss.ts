"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

/** Fraction of panel height that must be dragged before release dismisses. */
const DISMISS_FRAC = 0.28;
/** px/ms — fling down past this closes even below the distance threshold. */
const FLING_VELOCITY = 0.45;
/** Minimum downward travel (px) before a fling can dismiss. */
const FLING_MIN_DY = 36;
/** Axis lock: more vertical than horizontal by this ratio. */
const AXIS_RATIO = 1.15;
/** iOS-like sheet easing */
const SHEET_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const SNAP_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

type DragState = {
  pointerId: number;
  startY: number;
  startX: number;
  lastY: number;
  lastT: number;
  velocity: number;
  /** translateY frozen from CSS animation when the gesture arms */
  baseY: number;
  axis: "undecided" | "vertical" | "horizontal";
  active: boolean;
};

export type SwipeToDismissHandlers = {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
};

function readTranslateY(el: HTMLElement): number {
  const t = getComputedStyle(el).transform;
  if (!t || t === "none") return 0;
  try {
    return new DOMMatrixReadOnly(t).m42;
  } catch {
    return 0;
  }
}

/**
 * Interactive swipe-down-to-dismiss for mobile sheets/modals.
 * Drag follows the finger; release past a threshold (or fling) calls onDismiss.
 */
export function useSwipeToDismiss({
  enabled,
  onDismiss,
  panelRef,
  backdropRef,
  /** When set, content drags only dismiss when scrolled to the top. */
  scrollRef,
}: {
  enabled: boolean;
  onDismiss: () => void;
  panelRef: RefObject<HTMLElement | null>;
  backdropRef?: RefObject<HTMLElement | null>;
  scrollRef?: RefObject<HTMLElement | null>;
}): SwipeToDismissHandlers & { dragging: boolean; dismiss: () => void } {
  const dragRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const rafRef = useRef(0);
  const pendingYRef = useRef(0);
  const animTimerRef = useRef(0);
  const dismissingRef = useRef(false);

  const clearTransforms = useCallback(() => {
    const panel = panelRef.current;
    const backdrop = backdropRef?.current;
    if (panel) {
      panel.style.transform = "";
      panel.style.transition = "";
      panel.style.animation = "";
    }
    if (backdrop) {
      backdrop.style.opacity = "";
      backdrop.style.transition = "";
    }
  }, [panelRef, backdropRef]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (animTimerRef.current) window.clearTimeout(animTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      dragRef.current = null;
      setDragging(false);
      clearTransforms();
    }
  }, [enabled, clearTransforms]);

  const paintY = useCallback(
    (y: number) => {
      const panel = panelRef.current;
      if (!panel) return;
      const clamped = Math.max(0, y);
      panel.style.transition = "none";
      panel.style.animation = "none";
      panel.style.transform = `translate3d(0, ${clamped}px, 0)`;
      const backdrop = backdropRef?.current;
      if (backdrop) {
        const h = panel.offsetHeight || window.innerHeight;
        const progress = Math.min(1, clamped / Math.max(1, h * 0.85));
        backdrop.style.transition = "none";
        backdrop.style.opacity = String(Math.max(0, 1 - progress));
      }
    },
    [panelRef, backdropRef],
  );

  const applyDrag = useCallback(
    (y: number) => {
      pendingYRef.current = y;
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        paintY(pendingYRef.current);
      });
    },
    [paintY],
  );

  const waitTransition = useCallback(
    (el: HTMLElement, fallbackMs: number, done: () => void) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        el.removeEventListener("transitionend", onEnd);
        if (animTimerRef.current) window.clearTimeout(animTimerRef.current);
        animTimerRef.current = 0;
        done();
      };
      const onEnd = (e: TransitionEvent) => {
        if (e.target !== el) return;
        if (e.propertyName !== "transform" && e.propertyName !== "opacity") {
          return;
        }
        finish();
      };
      el.addEventListener("transitionend", onEnd);
      animTimerRef.current = window.setTimeout(finish, fallbackMs + 40);
    },
    [],
  );

  const snapBack = useCallback(() => {
    const panel = panelRef.current;
    const backdrop = backdropRef?.current;
    if (!panel) return;
    // Force a style flush so the transition always runs from the dragged Y.
    void panel.offsetHeight;
    panel.style.transition = `transform 380ms ${SNAP_EASE}`;
    panel.style.transform = "translate3d(0, 0, 0)";
    if (backdrop) {
      backdrop.style.transition = `opacity 320ms ${SNAP_EASE}`;
      backdrop.style.opacity = "1";
    }
    waitTransition(panel, 380, clearTransforms);
  }, [panelRef, backdropRef, clearTransforms, waitTransition]);

  const completeDismiss = useCallback(
    (currentY: number, velocity: number) => {
      if (dismissingRef.current) return;
      dismissingRef.current = true;
      const panel = panelRef.current;
      const backdrop = backdropRef?.current;
      if (!panel) {
        onDismissRef.current();
        return;
      }
      const height = panel.offsetHeight || window.innerHeight;
      const remaining = Math.max(0, height - currentY);
      // Faster flings finish sooner; slow drags ease out.
      const byVelocity =
        velocity > 0.05 ? remaining / Math.max(velocity, 0.35) : 320;
      const duration = Math.round(Math.min(360, Math.max(200, byVelocity)));

      void panel.offsetHeight;
      panel.style.transition = `transform ${duration}ms ${SHEET_EASE}`;
      panel.style.transform = `translate3d(0, ${height}px, 0)`;
      if (backdrop) {
        backdrop.style.transition = `opacity ${Math.max(160, duration - 40)}ms ease-out`;
        backdrop.style.opacity = "0";
      }
      waitTransition(panel, duration, () => {
        // Keep final off-screen transform until unmount so the feed doesn't
        // briefly reappear under a resetting panel (push-up glitch).
        onDismissRef.current();
      });
    },
    [panelRef, backdropRef, waitTransition],
  );

  /** Programmatic dismiss (X / backdrop / Escape) — same path as a completed swipe. */
  const dismiss = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) {
      onDismissRef.current();
      return;
    }
    const y = readTranslateY(panel);
    panel.style.animation = "none";
    panel.style.transition = "none";
    panel.style.transform = `translate3d(0, ${y}px, 0)`;
    completeDismiss(y, 0.55);
  }, [panelRef, completeDismiss]);

  const release = useCallback(
    (el: HTMLElement, pointerId: number) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== pointerId) return;
      dragRef.current = null;
      setDragging(false);
      try {
        el.releasePointerCapture(pointerId);
      } catch {
        /* already released */
      }

      if (!drag.active) return;

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
        paintY(pendingYRef.current);
      }

      const panel = panelRef.current;
      const height = panel?.offsetHeight || window.innerHeight;
      const dy = Math.max(0, drag.lastY - drag.startY);
      const y = drag.baseY + dy;
      const shouldDismiss =
        y >= height * DISMISS_FRAC ||
        (drag.velocity > FLING_VELOCITY && dy >= FLING_MIN_DY);

      if (shouldDismiss) completeDismiss(y, drag.velocity);
      else snapBack();
    },
    [panelRef, paintY, completeDismiss, snapBack],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("a, button, input, textarea, select, label")) return;

      // Content area: only start a dismiss drag when scrolled to top.
      if (scrollRef?.current && target) {
        const inScroll = scrollRef.current.contains(target);
        if (inScroll && scrollRef.current.scrollTop > 1) return;
      }

      dragRef.current = {
        pointerId: e.pointerId,
        startY: e.clientY,
        startX: e.clientX,
        lastY: e.clientY,
        lastT: performance.now(),
        velocity: 0,
        baseY: 0,
        axis: "undecided",
        active: false,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [enabled, scrollRef],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      if (drag.axis === "horizontal") return;

      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;

      if (drag.axis === "undecided") {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dx) * AXIS_RATIO > Math.abs(dy) || dy < 0) {
          drag.axis = "horizontal";
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            /* already released */
          }
          dragRef.current = null;
          return;
        }
        drag.axis = "vertical";
        drag.active = true;
        const panel = panelRef.current;
        // Freeze mid-enter animation so the panel doesn't jump.
        drag.baseY = panel ? readTranslateY(panel) : 0;
        if (panel) {
          panel.style.animation = "none";
          panel.style.transition = "none";
          panel.style.transform = `translate3d(0, ${drag.baseY}px, 0)`;
        }
        setDragging(true);
      }

      const now = performance.now();
      const dt = Math.max(1, now - drag.lastT);
      const frameV = (e.clientY - drag.lastY) / dt;
      // EMA so flings feel intentional, not noisy.
      drag.velocity = drag.velocity * 0.65 + frameV * 0.35;
      drag.lastY = e.clientY;
      drag.lastT = now;
      applyDrag(drag.baseY + dy);
    },
    [applyDrag, panelRef],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      release(e.currentTarget, e.pointerId);
    },
    [release],
  );

  const onPointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      release(e.currentTarget, e.pointerId);
    },
    [release],
  );

  return {
    dragging,
    dismiss,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  };
}
