"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import type { CityHeroFxMode, CityHeroPalette } from "@/lib/city-heroes";

type Orb = {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  colorIndex: number;
  phase: number;
};

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  colorIndex: number;
  spin: number;
};

type Ribbon = {
  y: number;
  amplitude: number;
  wavelength: number;
  phase: number;
  speed: number;
  colorIndex: number;
  opacity: number;
};

type WindStreak = {
  x: number;
  y: number;
  vx: number;
  life: number;
  maxLife: number;
  len: number;
  colorIndex: number;
};

/** Chicago flag–inspired six-pointed star, drifting on the wind. */
type FlagStar = {
  x: number;
  y: number;
  size: number;
  vx: number;
  vy: number;
  spin: number;
  phase: number;
  colorIndex: number;
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function drawSixPointStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outer: number,
  rotation: number,
  fill: string,
) {
  const inner = outer * 0.42;
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rotation + (i * Math.PI) / 6 - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function createPartyScene(palette: CityHeroPalette) {
  const orbs: Orb[] = [
    { x: 0.14, y: 0.32, r: 0.5, vx: 0.00016, vy: 0.0001, colorIndex: 0, phase: 0.2 },
    { x: 0.68, y: 0.22, r: 0.44, vx: -0.00014, vy: 0.00013, colorIndex: 1, phase: 1.1 },
    { x: 0.52, y: 0.7, r: 0.55, vx: 0.00012, vy: -0.00009, colorIndex: 2, phase: 2.4 },
    { x: 0.28, y: 0.78, r: 0.4, vx: -0.00011, vy: -0.00013, colorIndex: 3, phase: 3.6 },
    { x: 0.88, y: 0.58, r: 0.36, vx: 0.0001, vy: -0.00012, colorIndex: 0, phase: 4.2 },
    { x: 0.42, y: 0.4, r: 0.32, vx: 0.00013, vy: 0.00008, colorIndex: 2, phase: 5.1 },
  ];
  const sparks: Spark[] = [];

  const spawnSpark = (force = false) => {
    if (!force && sparks.length > 72) return;
    sparks.push({
      x: Math.random(),
      y: Math.random() * 0.85,
      vx: (Math.random() - 0.5) * 0.0006,
      vy: 0.0002 + Math.random() * 0.0007,
      life: 0,
      maxLife: 80 + Math.random() * 110,
      size: 2 + Math.random() * 4.5,
      colorIndex: Math.floor(Math.random() * palette.length),
      spin: (Math.random() - 0.5) * 0.28,
    });
  };

  for (let i = 0; i < 28; i++) spawnSpark(true);

  const drawStatic = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    colors: CityHeroPalette,
  ) => {
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    for (const orb of orbs) {
      const cx = orb.x * w;
      const cy = orb.y * h;
      const radius = orb.r * Math.min(w, h);
      const c = colors[orb.colorIndex % colors.length]!;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0, rgba(c, 0.5));
      grad.addColorStop(0.45, rgba(c, 0.2));
      grad.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  };

  const draw = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    colors: CityHeroPalette,
    time: number,
  ) => {
    const t = time * 0.001;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";

    for (const orb of orbs) {
      orb.x += orb.vx;
      orb.y += orb.vy;
      if (orb.x < 0.05 || orb.x > 0.95) orb.vx *= -1;
      if (orb.y < 0.08 || orb.y > 0.92) orb.vy *= -1;

      const pulse = 0.88 + Math.sin(t * 1.1 + orb.phase) * 0.14;
      const cx = orb.x * w + Math.sin(t * 0.7 + orb.phase) * 12;
      const cy = orb.y * h + Math.cos(t * 0.55 + orb.phase) * 10;
      const radius = orb.r * Math.min(w, h) * pulse;
      const c = colors[orb.colorIndex % colors.length]!;

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0, rgba(c, 0.55));
      grad.addColorStop(0.35, rgba(c, 0.22));
      grad.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    if (Math.random() < 0.55) spawnSpark();

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]!;
      s.life += 1;
      s.x += s.vx;
      s.y += s.vy;
      s.vx += Math.sin(t * 3 + s.spin) * 0.00002;

      if (s.life > s.maxLife || s.y > 1.05 || s.x < -0.05 || s.x > 1.05) {
        sparks.splice(i, 1);
        continue;
      }

      const fade =
        s.life < 12
          ? s.life / 12
          : Math.max(0, 1 - (s.life - 12) / (s.maxLife - 12));
      const c = colors[s.colorIndex % colors.length]!;
      const px = s.x * w;
      const py = s.y * h;
      const rot = s.life * s.spin;

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rot);
      ctx.fillStyle = rgba(c, 0.85 * fade);
      ctx.fillRect(-s.size * 0.4, -s.size, s.size * 0.8, s.size * 2.2);
      ctx.restore();

      ctx.fillStyle = rgba("#ffffff", 0.5 * fade);
      ctx.beginPath();
      ctx.arc(px, py, Math.max(0.8, s.size * 0.3), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "source-over";
  };

  return { drawStatic, draw };
}

/**
 * Chicago: lakefront aurora + wind streaks + flag stars (not confetti).
 */
function createLakeScene(palette: CityHeroPalette) {
  const ribbons: Ribbon[] = [
    { y: 0.32, amplitude: 0.022, wavelength: 7.2, phase: 0, speed: 0.75, colorIndex: 0, opacity: 0.18 },
    { y: 0.52, amplitude: 0.028, wavelength: 5.8, phase: 1.4, speed: 1.0, colorIndex: 1, opacity: 0.2 },
    { y: 0.7, amplitude: 0.02, wavelength: 8.0, phase: 2.8, speed: 0.6, colorIndex: 2, opacity: 0.15 },
  ];
  const streaks: WindStreak[] = [];
  const stars: FlagStar[] = [
    { x: 0.18, y: 0.28, size: 8, vx: 0.0001, vy: 0.00003, spin: 0.005, phase: 0.4, colorIndex: 3 },
    { x: 0.42, y: 0.18, size: 9, vx: -0.00006, vy: 0.00004, spin: -0.004, phase: 1.6, colorIndex: 3 },
    { x: 0.72, y: 0.32, size: 7, vx: 0.00008, vy: -0.00002, spin: 0.004, phase: 2.8, colorIndex: 3 },
    { x: 0.58, y: 0.55, size: 6, vx: -0.00009, vy: -0.00004, spin: -0.005, phase: 3.9, colorIndex: 1 },
    { x: 0.28, y: 0.62, size: 7, vx: 0.00007, vy: 0.00002, spin: 0.003, phase: 5.1, colorIndex: 2 },
    { x: 0.84, y: 0.48, size: 6, vx: -0.00005, vy: 0.00004, spin: 0.006, phase: 0.9, colorIndex: 3 },
  ];

  const spawnStreak = (force = false) => {
    if (!force && streaks.length > 56) return;
    streaks.push({
      x: -0.1,
      y: 0.08 + Math.random() * 0.82,
      vx: 0.0018 + Math.random() * 0.0026,
      life: 0,
      maxLife: 60 + Math.random() * 80,
      len: 42 + Math.random() * 78,
      colorIndex: Math.floor(Math.random() * palette.length),
    });
  };

  for (let i = 0; i < 28; i++) spawnStreak(true);

  const drawRibbon = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    ribbon: Ribbon,
    colors: CityHeroPalette,
    t: number,
    animated: boolean,
  ) => {
    const c = colors[ribbon.colorIndex % colors.length]!;
    const phase = animated ? t * ribbon.speed + ribbon.phase : ribbon.phase;
    const bandH = h * 0.045;

    ctx.beginPath();
    ctx.moveTo(0, ribbon.y * h);
    for (let x = 0; x <= w; x += 6) {
      const nx = x / w;
      const wave =
        Math.sin(nx * Math.PI * ribbon.wavelength + phase) * ribbon.amplitude * h;
      ctx.lineTo(x, ribbon.y * h + wave);
    }
    for (let x = w; x >= 0; x -= 6) {
      const nx = x / w;
      const wave =
        Math.sin(nx * Math.PI * ribbon.wavelength + phase + 0.35) *
        ribbon.amplitude *
        h;
      ctx.lineTo(x, ribbon.y * h + wave + bandH);
    }
    ctx.closePath();

    const grad = ctx.createLinearGradient(
      0,
      ribbon.y * h - bandH,
      0,
      ribbon.y * h + bandH * 2,
    );
    grad.addColorStop(0, rgba(c, 0));
    grad.addColorStop(0.4, rgba(c, ribbon.opacity));
    grad.addColorStop(0.7, rgba(c, ribbon.opacity * 0.55));
    grad.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = grad;
    ctx.fill();
  };

  const drawStars = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    colors: CityHeroPalette,
    t: number,
    animated: boolean,
  ) => {
    for (const star of stars) {
      if (animated) {
        star.x += star.vx;
        star.y += star.vy;
        if (star.x < 0.04 || star.x > 0.96) star.vx *= -1;
        if (star.y < 0.08 || star.y > 0.88) star.vy *= -1;
      }

      const pulse = 0.9 + Math.sin(t * 0.9 + star.phase) * 0.1;
      const driftX = animated ? Math.sin(t * 0.55 + star.phase) * 10 : 0;
      const driftY = animated ? Math.cos(t * 0.4 + star.phase) * 8 : 0;
      const cx = star.x * w + driftX;
      const cy = star.y * h + driftY;
      const size = star.size * pulse;
      const rot = animated ? t * star.spin + star.phase : star.phase;
      const c = colors[star.colorIndex % colors.length]!;

      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 2.2);
      glow.addColorStop(0, rgba(c, 0.16));
      glow.addColorStop(0.55, rgba(c, 0.05));
      glow.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, size * 2.2, 0, Math.PI * 2);
      ctx.fill();

      drawSixPointStar(ctx, cx, cy, size, rot, rgba(c, 0.28));
      drawSixPointStar(ctx, cx, cy, size * 0.4, rot + Math.PI / 12, rgba("#ffffff", 0.12));
    }
  };

  const drawStatic = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    colors: CityHeroPalette,
  ) => {
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    for (const ribbon of ribbons) {
      drawRibbon(ctx, w, h, ribbon, colors, 0, false);
    }
    drawStars(ctx, w, h, colors, 0, false);
    ctx.globalCompositeOperation = "source-over";
  };

  const draw = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    colors: CityHeroPalette,
    time: number,
  ) => {
    const t = time * 0.001;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";

    for (const ribbon of ribbons) {
      drawRibbon(ctx, w, h, ribbon, colors, t, true);
    }

    if (Math.random() < 0.55) spawnStreak();

    for (let i = streaks.length - 1; i >= 0; i--) {
      const s = streaks[i]!;
      s.life += 1;
      s.x += s.vx;
      s.y += Math.sin(t * 2.2 + s.life * 0.05) * 0.0001;

      if (s.life > s.maxLife || s.x > 1.1) {
        streaks.splice(i, 1);
        continue;
      }

      const fade =
        s.life < 8
          ? s.life / 8
          : Math.max(0, 1 - (s.life - 8) / (s.maxLife - 8));
      const c = colors[s.colorIndex % colors.length]!;
      const px = s.x * w;
      const py = s.y * h;
      const len = s.len * (0.6 + 0.4 * fade);

      const grad = ctx.createLinearGradient(px - len, py, px + len * 0.2, py);
      grad.addColorStop(0, rgba(c, 0));
      grad.addColorStop(0.3, rgba(c, 0.65 * fade));
      grad.addColorStop(0.6, rgba("#ffffff", 0.18 * fade));
      grad.addColorStop(0.9, rgba(c, 0.28 * fade));
      grad.addColorStop(1, rgba(c, 0));
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.2 + fade * 1.6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(px - len, py);
      ctx.lineTo(px + len * 0.2, py);
      ctx.stroke();
    }

    drawStars(ctx, w, h, colors, t, true);

    ctx.globalCompositeOperation = "source-over";
  };

  return { drawStatic, draw };
}

/**
 * City-specific canvas overlay — transparent base so the photo shows through.
 * SF: drifting neon orbs + confetti sparks.
 * Chicago: lakefront aurora, wind streaks, and flag stars.
 */
export function CityHeroFx({
  mode,
  colors,
  blendMode = "screen",
  className = "",
}: {
  mode: CityHeroFxMode;
  colors: CityHeroPalette;
  blendMode?: CSSProperties["mixBlendMode"];
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colorsRef = useRef(colors);
  const modeRef = useRef(mode);

  useEffect(() => {
    colorsRef.current = colors;
  }, [colors]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const party = createPartyScene(colorsRef.current);
    const lake = createLakeScene(colorsRef.current);

    const sceneFor = (fxMode: CityHeroFxMode) =>
      fxMode === "lake" ? lake : party;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const drawStatic = () => {
      sceneFor(modeRef.current).drawStatic(ctx, w, h, colorsRef.current);
    };

    const draw = (time: number) => {
      sceneFor(modeRef.current).draw(ctx, w, h, colorsRef.current, time);
      raf = requestAnimationFrame(draw);
    };

    resize();
    if (reduceMotion) {
      drawStatic();
    } else {
      raf = requestAnimationFrame(draw);
    }

    const ro = new ResizeObserver(() => {
      resize();
      if (reduceMotion) drawStatic();
    });
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [mode]);

  return (
    <canvas
      ref={canvasRef}
      className={`city-hero__fx ${className}`.trim()}
      style={{ mixBlendMode: blendMode }}
      aria-hidden
    />
  );
}
