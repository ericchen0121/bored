/**
 * Sanity: every curated food deal resolves to an https poster (all metros).
 * Run: pnpm --filter @bored/shared exec tsx src/curatedFoodDealImages.selftest.ts
 */
import { CURATED_FOOD_DEALS } from "./foodDeals.js";
import { curatedFoodDealImageUrl } from "./curatedFoodDealImages.js";

let failed = 0;
const byCity = new Map<string, number>();

for (const deal of CURATED_FOOD_DEALS) {
  const city = deal.city ?? "sf";
  byCity.set(city, (byCity.get(city) ?? 0) + 1);
  const url = curatedFoodDealImageUrl({
    dealId: deal.id,
    title: deal.title,
    dealSummary: `${deal.dealSummary} ${deal.description}`,
    dealKind: deal.dealKind,
  });
  if (!url?.startsWith("https://images.unsplash.com/")) {
    console.error(`FAIL ${city} ${deal.id}: ${url}`);
    failed += 1;
  }
}

for (const [city, n] of [...byCity.entries()].sort()) {
  console.log(`ok ${city}: ${n} deals`);
}

if (failed) {
  console.error(`${failed} deal(s) missing posters`);
  process.exit(1);
}

console.log(`ok all ${CURATED_FOOD_DEALS.length} food deals have posters`);
