import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import {
  parseEventbriteJsonLdLocation,
  parseFuncheapStatsLocation,
} from "./funcheap.js";

// Plain spans (no /venue/ taxonomy link) — Fog City Improv style.
{
  const $ = cheerio.load(`
    <div id="stats" class="clearfloat">
      <span class="left">
        <a href="/2026/09/04/">Friday, September 4, 2026</a>
        <span style="font-weight:normal;"> - 8:00 pm
          <span class="cost"> | Cost:</span>
          <a href="#" class="tt">FREE*</a>
          <br>
          <span>Mabuhay Gardens</span> <span>| 435 Broadway St</span>
        </span>
      </span>
    </div>
  `);
  const loc = parseFuncheapStatsLocation($);
  assert.equal(loc.venueName, "Mabuhay Gardens");
  assert.equal(loc.address, "435 Broadway St");
}

// Classic /venue/ link + city address.
{
  const $ = cheerio.load(`
    <div id="stats" class="clearfloat">
      <span class="left">
        <a href="/2026/09/04/">Friday</a>
        <span> - 7:00 pm<span class="cost"> | Cost:</span> FREE<br>
          <a href="/venue/the-function/">The Function</a> | 1414 Market Street, San Francisco, CA
          <span class="region-links"><a href="/region/sf/">SF</a></span>
        </span>
      </span>
    </div>
  `);
  const loc = parseFuncheapStatsLocation($);
  assert.equal(loc.venueName, "The Function");
  assert.equal(loc.address, "1414 Market Street, San Francisco, CA");
  assert.equal(loc.neighborhood, "SF");
}

// Eventbrite JSON-LD Place with full streetAddress.
{
  const loc = parseEventbriteJsonLdLocation({
    "@type": "Event",
    location: {
      "@type": "Place",
      name: "Mabuhay Gardens",
      address: {
        "@type": "PostalAddress",
        addressLocality: "San Francisco",
        addressRegion: "CA",
        addressCountry: "US",
        streetAddress: "443 Broadway, San Francisco, CA 94133",
      },
    },
  });
  assert.equal(loc.venueName, "Mabuhay Gardens");
  assert.equal(loc.address, "443 Broadway, San Francisco, CA 94133");
}

// Eventbrite JSON-LD with split street / city / region.
{
  const loc = parseEventbriteJsonLdLocation({
    "@type": "Event",
    location: {
      name: "Fluid510",
      address: {
        streetAddress: "1544 Broadway",
        addressLocality: "Oakland",
        addressRegion: "CA",
        postalCode: "94612",
      },
    },
  });
  assert.equal(loc.venueName, "Fluid510");
  assert.equal(loc.address, "1544 Broadway, Oakland, CA 94612");
}

console.log("funcheap.selftest ok");
