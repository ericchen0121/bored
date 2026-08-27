# Monetization & marketing

Local events discovery (SF Bay + Chicago). **No ads or payments in product yet** beyond outbound click tracking + affiliate URL rewriting. Strategy: sell high-intent “what’s on tonight” inventory to local venues — not display CPM or consumer paywalls.

## Principles

1. **Protect the feed** — Sponsored items use the same card chrome, are labeled, and stay ≤1 per ~8 organic cards. Never sell the serendipity slot as pure ads.
2. **Sell intent, not impressions** — Tonight / This weekend / Happy hours / Comedy are high-intent surfaces. Price by placement + metro + category.
3. **City density before scale** — Monetize SF hard before a third metro. Chicago sells once food + comedy + calendars feel as dense as SF.
4. **Outbound already exists** — Ticket / Register CTAs are the first money path (affiliates + click logs) with no UI clutter.

## Revenue stack (priority)

| Priority | Stream | Notes |
|---|---|---|
| **P0** | Ticket / listing affiliates | Wrap Ticketmaster, Eventbrite, etc. via `/r/*` redirect |
| **P0** | Boosted / sponsored listings | Native feed cards; schema + ranker inject next |
| **P1** | Local sponsor packages | Founder-sold retainers (Venue Boost, HH/Food, festival weeks) |
| **P1** | Featured happy hour / food deal | Guaranteed slot in Food / Happy hours chips |
| **P2** | Email / IG takeover | After weekly digest or Reels cadence exists |
| **P2** | Organizer self-serve (claim + boost) | Needs auth + billing |
| **P3** | Display / programmatic | Avoid early — brand risk |
| Later | Consumer premium | Deprioritize until personalization is sticky |

## Outbound redirects (shipped)

All primary event CTAs and movie ticket buttons should go through the API so we can stamp UTMs, apply affiliate IDs when configured, and log clicks for sales decks.

| Route | Resolves | Query |
|---|---|---|
| `GET /r/e/:eventId` | Event primary or secondary URL from DB | `slot=primary` (default) \| `secondary` |
| `GET /r/s/:showtimeId` | Showtime `ticketUrl` from DB | — |

**Security:** Destinations come only from stored rows — never from a client-supplied URL (open-redirect safe).

**Affiliate map** (`packages/shared/src/affiliate.ts`):

- Detects Ticketmaster / LiveNation / Eventbrite hosts
- Applies `TICKETMASTER_AFFILIATE_ID` / `EVENTBRITE_AFFILIATE_CODE` when set
- Always adds `utm_source` / `utm_medium` (defaults `bored` / `feed`) unless already present
- Other hosts get UTMs only (Dice, AXS, Luma, etc.)

**Click log:** `outbound_clicks` table — target kind/id, slot, destination host, affiliate network, event `source` + `city`, optional `userId` from `X-User-Id`.

Env (see `.env.example`):

```bash
TICKETMASTER_AFFILIATE_ID=
EVENTBRITE_AFFILIATE_CODE=
OUTBOUND_UTM_SOURCE=bored
OUTBOUND_UTM_MEDIUM=feed
```

Web helpers: `apps/web/src/lib/outbound.ts` → `eventOutboundHref`, `showtimeOutboundHref`.

## Ad placements (product map)

| Surface | Placement | Label |
|---|---|---|
| Home feed grid | 1 native card every ~8–10 rows | Sponsored |
| By time | First card under Tonight / timed blocks | Sponsored |
| Topic chips | Comedy / Happy hours / Food filtered feeds | Featured |
| Movies strip | Indie theater or festival week | Partner |
| Event detail | Secondary “nearby” sponsored tip (not replacing tickets CTA) | Sponsored tip |
| Onboarding | **No ads** | — |

## Local sponsor packages (starting asks)

SF first; Chicago ~20–30% lower until MAU parity. Negotiate vs Do312 / Time Out local / newsletter rates.

| Package | Ask | Includes |
|---|---|---|
| **Venue Boost** | $400–800 / mo | 4 boosted listings / mo; 1 pinned Tonight slot / week; monthly click report |
| **Happy Hour / Food** | $250–500 / mo | Guaranteed Food / HH chip placement; deal card in curated layer |
| **Festival / Launch week** | $1.5–4k / week | Subtle homepage strip; category feature; optional IG/email |

### Ideal buyers

Comedy clubs, indie music venues/promoters, bars with HH, indie theaters/fests, new restaurant openings, activity venues (arcade / axe / mini-golf).

### Sales motion

1. Pull venues that already appear often in the feed.
2. Send Tonight screenshot + their organic listing.
3. Offer 2-week free boost → convert to Venue Boost.
4. Report opens/clicks from `outbound_clicks` (honesty sells at pre-scale).

## Marketing

**Positioning:** “Your well-read local friend for tonight” — not a tourism board, not Ticketmaster.

| Channel | Play |
|---|---|
| IG / TikTok Reels | 3×/week “Tonight in SF/CHI” |
| SEO | “Things to do in SF tonight”, comedy/weekend + neighborhood pages |
| Venue co-marketing | Trade free boost for story / door QR / newsletter |
| Newsletter swap | Local Substacks (food, nightlife) |
| Campus / new-in-town | Student orgs, relocation Slacks |
| City waitlist | Before metro #3 |

## 90-day roadmap

| Phase | Days | Build | GTM |
|---|---|---|---|
| 1 · Quiet money | 0–30 | **Outbound redirect + affiliates + click log** (done); sponsored flag in schema | 10 warm SF venue emails; Tonight Reels 3×/week |
| 2 · Native boost | 30–60 | Ranker boost + feed injection (max 1/8); admin/JSON sponsor config | Convert trials; 3 paying SF sponsors |
| 3 · Packages | 60–90 | HH featured slot; weekly email MVP; Chicago rate card | CHI outreach; first festival week; SEO pages |

## Product hooks (next)

- `events.isSponsored` / `sponsorId` / `boostWeight` / `sponsorEndsAt` (or `rawPayload` + config YAML)
- `sponsors` table: name, metro, package, billing link
- Ranker: inject after organic ranking; respect city/area/topic; frequency cap; never replace the only organic result in a niche filter

## Do not do (yet)

- AdSense / programmatic display
- Consumer subscription / feed paywall
- Selling onboarding
- National brand CPM deals
- Self-serve billing before auth

## Success metrics

- ≥3 paying SF sponsors by day 90
- ≤12% sponsored cards of feed impressions
- Affiliate + UTM on every ticket / primary CTA
- Secondary: Reel → site CTR, onboarding completion, weekly Tonight openers
