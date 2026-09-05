import assert from "node:assert/strict";
import {
  hasStrongInterestCategory,
  isWeakEventTaxonomy,
} from "@bored/shared";
import { llmTaxonomyInputHash } from "./llmTaxonomy.js";

assert.equal(isWeakEventTaxonomy([]), true);
assert.equal(isWeakEventTaxonomy(["free"]), true);
assert.equal(isWeakEventTaxonomy(["nightlife", "free"]), true);
assert.equal(isWeakEventTaxonomy(["outdoors", "free"]), false);
assert.equal(isWeakEventTaxonomy(["comedy.showcase"]), false);
assert.equal(hasStrongInterestCategory(["music.live"]), true);

const a = llmTaxonomyInputHash({
  title: "Chair Yoga",
  description: "improves wellbeing",
  categories: ["free"],
  tags: ["rss"],
  source: "funcheap",
});
const b = llmTaxonomyInputHash({
  title: "Chair Yoga",
  description: "improves wellbeing",
  categories: ["free"],
  tags: ["rss"],
  source: "funcheap",
});
const c = llmTaxonomyInputHash({
  title: "Chair Yoga",
  description: "improves wellbeing a lot",
  categories: ["free"],
  tags: ["rss"],
  source: "funcheap",
});
assert.equal(a, b);
assert.notEqual(a, c);

console.log("llmTaxonomy.selftest ok");
