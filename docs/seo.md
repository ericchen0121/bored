# SEO & AI discovery (AEO)

Bored is an events discovery product. Search engines and AI assistants (ChatGPT, Perplexity, Gemini, Claude, etc.) should be able to find **what's happening in each city** without executing client-side JavaScript.

## Principles

1. **Server-render indexable pages** — crawlers and LLM fetchers must receive HTML with real titles, descriptions, and event links.
2. **Curated topic hubs, not raw tags** — index `/{city}/{topic}` (e.g. `/sf/concerts`), not `/tags/techno`. Ingest tags include noise (`19hz`, `play_kind:…`, `price_$`) and create thin duplicate URLs.
3. **Event detail pages are the leaf nodes** — `/events/:id` gets full metadata, OG images, and `Event` JSON-LD.
4. **Topic hubs are the landing pages** — `/sf/comedy`, `/chicago/free` match head-term queries and give AI a stable summary + item list + FAQ.
5. **Freshness via RSS + llms-full** — machine-readable feeds and a live sample briefing so answer engines can re-fetch current listings.
6. **The interactive feed stays client-side** — `/{city}?topics=…` is for logged-in UX; canonical URLs point at path-based hubs when a single topic is the intent.

## URL map

| URL | Role | Index? |
|---|---|---|
| `/{city}` | Interactive feed home (client) | City home — limited crawl value |
| `/{city}/{topic}` | SSR topic listing hub + FAQ | **Yes** (when enough upcoming items) |
| `/{city}/map` | Map UI | No (`noindex`) |
| `/events/:id` | Event detail | **Yes** (upcoming + recent) |
| `/movies/:id` | Film detail | **Yes** |
| `/feed/{city}` | City RSS | Machine feed |
| `/feed/{city}/{topic}` | Topic RSS | Machine feed |
| `/llms.txt` | Compact AI site map | Discovery |
| `/llms-full.txt` | Expanded briefing + sample listings | Discovery |
| `/ai.txt` | Citation / crawl policy for AI | Discovery |
| `/admin/*`, `/onboarding`, `/auth` | Ops / onboarding | No |

`{city}` ∈ `sf` \| `chicago` \| `la`. `{topic}` ∈ `FEED_TOPICS` (`concerts`, `comedy`, `movies`, …).

## What we ship

### Topic listing hubs (`apps/web/src/app/[city]/[topic]/page.tsx`)

- SSR fetch via `GET /v1/feed?mode=all&topics=…&area=…&limit=50`
- Semantic HTML: `h1`, intro paragraph, `<ul>` of linked events
- Answer-first **FAQ** block + `FAQPage` JSON-LD (high AEO leverage)
- `generateMetadata`: title, description, canonical, OG, RSS alternate
- `noindex` when fewer than `MIN_INDEXABLE_EVENTS` (default 3) upcoming cards
- JSON-LD: `ItemList` + `BreadcrumbList` + `FAQPage`

### Event / movie detail

- `/events/:id` — `Event` JSON-LD + canonical
- `/movies/:id` — `Movie` JSON-LD (ratings + watch actions when showtimes exist)

### Site graph

Root layout emits `Organization` + `WebSite` (+ `SearchAction` → `/search?q=`).

### Sitemap & robots

- `app/sitemap.ts` — city home + topic hubs + dynamic upcoming `/events/:id` and `/movies/:id` (via `GET /v1/seo/sitemap`)
- `app/robots.ts` — allow public routes for `*` and major AI crawlers (`GPTBot`, `ClaudeBot`, `PerplexityBot`, `Google-Extended`, …); disallow `/admin/`, `/onboarding/`, `/auth/`

### RSS (freshness)

- `/feed/{city}` — upcoming city listings
- `/feed/{city}/{topic}` — topic-scoped listings  
Linked from topic hub pages and `llms.txt`.

### AI discovery files

| File | Purpose |
|---|---|
| `/llms.txt` | Short curated index of city + topic URLs |
| `/llms-full.txt` | Product facts + **live sample listings** per city/topic for citation |
| `/ai.txt` | Allow citation/indexing; prefer attribution; no training claim |

### Site search (`/search?q=`)

Lightweight redirect for `SearchAction`:

- `/search?q=concerts+in+chicago` → `/chicago/concerts`
- Unknown queries fall back to the best-matching city feed

Feed topic chips **filter the interactive feed** (`?topics=`). Path-based hub URLs live in a secondary footer nav on the city page (and sitemap / `llms.txt`) so crawlers still get internal links without hijacking the product chrome.

## Tag chips vs topic hubs

| Surface | Behavior |
|---|---|
| Feed card tags | Display only — genres, categories, deal labels |
| Feed topic chips | Filter the client feed (`?topics=`) |
| City page footer | Text links to SSR hubs (`/{city}/{topic}`) |
| Topic hub pages | Indexable, shareable, AI-citable listings |

Never auto-index arbitrary tag strings.

## Structured data

| Page | Schema |
|---|---|
| Root layout | `Organization`, `WebSite` + `SearchAction` |
| Topic hub | `ItemList`, `BreadcrumbList`, `FAQPage` |
| Event detail | `Event` |
| Movie detail | `Movie` |

Use absolute URLs from `siteUrl()` / `NEXT_PUBLIC_SITE_URL` for `@id` and `url` fields.

## Content guidelines for hubs

Intro + FAQ answers should state:

- **What** this topic covers in this city
- **When** listings reflect (upcoming window)
- **Where** the metro scope is
- **How** to verify (link to the hub / event URL)

Write for humans first; AI systems extract the same signals from clear prose + structured lists + FAQ schema.

## Multi-city expansion

Adding a city:

1. Add to `FEED_CITIES` in `taxonomy.ts`
2. Sitemap, `llms.txt`, `llms-full.txt`, and RSS pick it up automatically
3. Topic hubs work once ingest sets `city` on rows and area filter passes
4. Extend intro/FAQ copy in `topic-seo.ts` if needed

## Production

Set `NEXT_PUBLIC_SITE_URL` on the **web** service at **build** time (already configured on Railway as `https://bored-app.up.railway.app`). Canonicals, JSON-LD, OG, sitemap, RSS, and AI text files all depend on it.

## Out of scope (for now)

- Per-tag index pages (`/tags/:slug`)
- Per-venue or per-neighborhood SEO pages
- Full-text search UI (`/search` redirects only)
- Markdown mirrors of every HTML page

## Related

- [Architecture — Feed product surface](./architecture.md#feed-product-surface)
- [Ingest — category mapping for topic filters](./ingest.md#category-mapping-for-topic-filters)
- [API — feed query params](./api.md)
