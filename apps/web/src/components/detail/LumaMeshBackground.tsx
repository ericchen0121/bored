"use client";

import { useEffect, useRef } from "react";
import type { EventTypeKind } from "@bored/shared";

export type MeshPalette = [string, string, string];

const DEFAULT_PALETTE: MeshPalette = ["#3d8ea5", "#7c4dff", "#d96b4c"];

/** Event-type palettes — Luma-style saturated mesh tones */
export const MESH_PALETTES: Record<EventTypeKind, MeshPalette> = {
  music: ["#7c4dff", "#e040fb", "#311b92"],
  comedy: ["#ffb74d", "#ff8a65", "#e65100"],
  tech: ["#4dd0e1", "#26c6da", "#00838f"],
  food: ["#ff8a65", "#ff7043", "#bf360c"],
  arts: ["#f48fb1", "#ec407a", "#880e4f"],
  outdoors: ["#81c784", "#66bb6a", "#1b5e20"],
  nightlife: ["#7986cb", "#5c6bc0", "#1a237e"],
  family: ["#ffd54f", "#ffca28", "#f57f17"],
  movies: ["#90a4ae", "#607d8b", "#263238"],
  free: ["#80cbc4", "#4db6ac", "#004d40"],
  event: DEFAULT_PALETTE,
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpColorRgba(
  from: string,
  to: string,
  t: number,
  alpha: number,
): string {
  const [r1, g1, b1] = hexToRgb(from);
  const [r2, g2, b2] = hexToRgb(to);
  const r = Math.round(lerp(r1, r2, t));
  const g = Math.round(lerp(g1, g2, t));
  const b = Math.round(lerp(b1, b2, t));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type Blob = {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  colorIndex: number;
};

export function LumaMeshBackground({
  colors = DEFAULT_PALETTE,
  className = "",
}: {
  colors?: MeshPalette;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colorsRef = useRef(colors);

  useEffect(() => {
    colorsRef.current = colors;
  }, [colors]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const blobs: Blob[] = [
      { x: 0.3, y: 0.2, r: 0.55, vx: 0.00008, vy: 0.00006, colorIndex: 0 },
      { x: 0.75, y: 0.35, r: 0.5, vx: -0.00006, vy: 0.00009, colorIndex: 1 },
      { x: 0.5, y: 0.75, r: 0.6, vx: 0.00007, vy: -0.00005, colorIndex: 2 },
      { x: 0.15, y: 0.65, r: 0.45, vx: 0.00005, vy: -0.00007, colorIndex: 1 },
    ];

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (time: number) => {
      const palette = colorsRef.current;
      const t = time * 0.001;

      ctx.fillStyle = "#0c1218";
      ctx.fillRect(0, 0, w, h);

      for (const blob of blobs) {
        blob.x += blob.vx;
        blob.y += blob.vy;
        if (blob.x < 0.05 || blob.x > 0.95) blob.vx *= -1;
        if (blob.y < 0.05 || blob.y > 0.95) blob.vy *= -1;

        const pulse = 0.92 + Math.sin(t * 0.4 + blob.colorIndex) * 0.08;
        const cx = blob.x * w;
        const cy = blob.y * h;
        const radius = blob.r * Math.min(w, h) * pulse;

        const c0 = palette[blob.colorIndex % 3]!;
        const c1 = palette[(blob.colorIndex + 1) % 3]!;
        const mix = 0.5 + Math.sin(t * 0.25 + blob.x * 4) * 0.5;

        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        grad.addColorStop(0, lerpColorRgba(c0, c1, mix, 0.55));
        grad.addColorStop(0.45, lerpColorRgba(c0, c1, mix, 0.22));
        grad.addColorStop(1, "rgba(12, 18, 24, 0)");

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }

      // Soft vignette so content stays readable
      const vignette = ctx.createLinearGradient(0, 0, 0, h);
      vignette.addColorStop(0, "rgba(12, 18, 24, 0.35)");
      vignette.addColorStop(0.35, "rgba(12, 18, 24, 0.08)");
      vignette.addColorStop(1, "rgba(12, 18, 24, 0.72)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);

      raf = requestAnimationFrame(draw);
    };

    resize();
    raf = requestAnimationFrame(draw);

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`detail-drawer__mesh ${className}`.trim()}
      aria-hidden
    />
  );
}
