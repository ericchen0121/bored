#!/usr/bin/env node
/**
 * HEAD-check every Unsplash hero URL in shared cityHeroImages.
 * Run when adding a metro: pnpm check:city-heroes
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const heroesPath = join(root, "packages/shared/src/cityHeroImages.ts");
const src = readFileSync(heroesPath, "utf8");

const metaBlock = src.match(
  /export const CITY_HERO_IMAGE_META[\s\S]*?= \{([\s\S]*?)\};/,
)?.[1];
if (!metaBlock) {
  console.error("Could not parse CITY_HERO_IMAGE_META from cityHeroImages.ts");
  process.exit(1);
}

const entries = [
  ...metaBlock.matchAll(/^\s{2}(\w+):\s*\{[\s\S]*?photoId:\s*"([^"]+)"/gm),
];
const failures = [];

for (const [, city, photoId] of entries) {
  const url = `https://images.unsplash.com/photo-${photoId}?auto=format&fit=crop&w=1800&h=900&q=80`;
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (!res.ok) {
      failures.push({ city, url, status: res.status });
    } else {
      console.log(`ok  ${city}  ${res.status}`);
    }
  } catch (err) {
    failures.push({ city, url, error: err.message });
  }
}

if (failures.length) {
  console.error("\nCity hero image check failed:");
  for (const f of failures) {
    console.error(`  ${f.city}: ${f.url} → ${f.status ?? f.error}`);
  }
  process.exit(1);
}

console.log(`\nAll ${entries.length} city hero URLs OK.`);
