import {
  db,
  events,
  feedDemotionRules,
  ingestJobs,
  ingestRuns,
  outboundClicks,
  sponsors,
} from "@bored/db";
import {
  ALL_ADAPTER_IDS,
  PHASE1_ADAPTER_IDS,
  STATIC_INGEST_SCHEDULES,
} from "@bored/ingest/meta";
import { INTEREST_CATEGORIES, demotionMetroMatches, eventInArea, FEED_AREAS, type FeedArea } from "@bored/shared";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

function adminTokenConfigured(): string | null {
  const t = process.env.ADMIN_TOKEN?.trim();
  return t || null;
}

function requireAdmin(
  c: { req: { header: (n: string) => string | undefined } },
): Response | null {
  const expected = adminTokenConfigured();
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      return new Response(JSON.stringify({ error: "Admin disabled" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Local/dev: allow when ADMIN_TOKEN unset so ops can boot without config,
    // but still require a Bearer token matching empty is wrong — require any
    // non-empty Bearer only when token is set.
  }
  if (!expected) {
    // Dev without token: accept any Authorization Bearer or X-Admin-Token header
    // that is non-empty OR allow through with warning header. Safer: require
    // ADMIN_TOKEN even in dev once documented.
    return new Response(
      JSON.stringify({
        error: "ADMIN_TOKEN is not set. Add it to .env to use admin APIs.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const auth = c.req.header("Authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  const headerTok = c.req.header("X-Admin-Token")?.trim() ?? null;
  const got = bearer || headerTok;
  if (!got || got !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

const PatchEventSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    categories: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    imageUrl: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    neighborhood: z.string().nullable().optional(),
    hidden: z.boolean().optional(),
    isSponsored: z.boolean().optional(),
    sponsorId: z.string().uuid().nullable().optional(),
    boostWeight: z.number().optional(),
    sponsorEndsAt: z.string().nullable().optional(),
  })
  .strict();

const CreateJobSchema = z.object({
  scope: z.enum(["phase1", "all", "adapters"]),
  adapterIds: z.array(z.string()).optional(),
});

const SponsorBodySchema = z.object({
  name: z.string().min(1),
  metro: z.string().min(1).default("sf"),
  package: z.enum(["venue_boost", "happy_hour", "festival"]).default("venue_boost"),
  contactEmail: z
    .union([z.string().email(), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  notes: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

const BoostSchema = z.object({
  eventId: z.string().uuid(),
  boostWeight: z.number().optional(),
  sponsorEndsAt: z.string().nullable().optional(),
});

const DemotionRuleFieldsSchema = z.object({
  name: z.string().min(1),
  metro: z
    .union([z.string().min(1), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  source: z
    .union([z.string().min(1), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  venueContains: z
    .union([z.string().min(1), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  categoryContains: z
    .union([z.string().min(1), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  scoreMultiplier: z.number().min(0).max(1).default(0.35),
  maxPerVenue: z
    .union([z.number().int().min(0), z.null()])
    .optional()
    .transform((v) => (v === undefined ? null : v)),
  notes: z
    .union([z.string(), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  active: z.boolean().optional(),
});

const DemotionRuleBodySchema = DemotionRuleFieldsSchema.superRefine(
  (val, ctx) => {
    if (
      !val.metro &&
      !val.source &&
      !val.venueContains &&
      !val.categoryContains
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "At least one match field required (metro, source, venue, or category)",
      });
    }
  },
);

export const adminApp = new Hono();

adminApp.use("*", async (c, next) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  await next();
});

adminApp.get("/health", (c) => c.json({ ok: true }));

adminApp.get("/ingest/adapters", async (c) => {
  const recent = await db
    .select()
    .from(ingestRuns)
    .orderBy(desc(ingestRuns.startedAt))
    .limit(500);

  const byId = new Map<string, (typeof recent)[number]>();
  for (const r of recent) {
    if (!byId.has(r.adapterId)) byId.set(r.adapterId, r);
  }

  const phase1Ids = new Set<string>(PHASE1_ADAPTER_IDS);
  const adapters = ALL_ADAPTER_IDS.map((id) => {
    const last = byId.get(id);
    return {
      id,
      phase1: phase1Ids.has(id),
      lastRun: last
        ? {
            id: last.id,
            status: last.status,
            startedAt: last.startedAt,
            finishedAt: last.finishedAt,
            itemsUpserted: last.itemsUpserted,
            error: last.error,
          }
        : null,
    };
  });

  return c.json({
    adapters,
    schedules: STATIC_INGEST_SCHEDULES,
  });
});

adminApp.get("/ingest/runs", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const offset = Math.max(Number(c.req.query("offset") ?? 0), 0);
  const adapterId = c.req.query("adapterId");
  const status = c.req.query("status");

  const where = and(
    adapterId ? eq(ingestRuns.adapterId, adapterId) : undefined,
    status ? eq(ingestRuns.status, status) : undefined,
  );

  const rows = await db
    .select()
    .from(ingestRuns)
    .where(where)
    .orderBy(desc(ingestRuns.startedAt))
    .limit(limit)
    .offset(offset);

  return c.json({ runs: rows });
});

adminApp.get("/ingest/jobs", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 30), 100);
  const rows = await db
    .select()
    .from(ingestJobs)
    .orderBy(desc(ingestJobs.requestedAt))
    .limit(limit);
  return c.json({ jobs: rows });
});

adminApp.post("/ingest/jobs", async (c) => {
  const body = CreateJobSchema.parse(await c.req.json());
  if (body.scope === "adapters" && !(body.adapterIds?.length)) {
    return c.json({ error: "adapterIds required for scope=adapters" }, 400);
  }
  const [job] = await db
    .insert(ingestJobs)
    .values({
      scope: body.scope,
      adapterIds: body.adapterIds ?? [],
      status: "pending",
      requestedBy: "admin",
    })
    .returning();
  return c.json({ job }, 201);
});

adminApp.get("/events", async (c) => {
  const q = c.req.query("q")?.trim();
  const source = c.req.query("source");
  const city = c.req.query("city");
  const kind = c.req.query("kind");
  const sponsored = c.req.query("sponsored");
  const hidden = c.req.query("hidden");
  const hasImage = c.req.query("hasImage");
  const limit = Math.min(Number(c.req.query("limit") ?? 40), 100);
  const offset = Math.max(Number(c.req.query("offset") ?? 0), 0);

  const filters = [];
  if (source) filters.push(eq(events.source, source));
  if (city) filters.push(eq(events.city, city));
  if (kind) filters.push(eq(events.kind, kind));
  if (sponsored === "1" || sponsored === "true") {
    filters.push(eq(events.isSponsored, true));
  }
  if (sponsored === "0" || sponsored === "false") {
    filters.push(eq(events.isSponsored, false));
  }
  if (hidden === "1" || hidden === "true") {
    filters.push(eq(events.hidden, true));
  }
  if (hidden === "0" || hidden === "false") {
    filters.push(eq(events.hidden, false));
  }
  if (hasImage === "1" || hasImage === "true") {
    filters.push(isNotNull(events.imageUrl));
  }
  if (hasImage === "0" || hasImage === "false") {
    filters.push(sql`${events.imageUrl} is null`);
  }
  if (q) {
    const like = `%${q}%`;
    filters.push(
      or(
        ilike(events.title, like),
        ilike(events.sourceEventId, like),
        sql`${events.id}::text ilike ${like}`,
      )!,
    );
  }

  const rows = await db
    .select({
      id: events.id,
      source: events.source,
      sourceEventId: events.sourceEventId,
      kind: events.kind,
      title: events.title,
      city: events.city,
      startsAt: events.startsAt,
      imageUrl: events.imageUrl,
      categories: events.categories,
      tags: events.tags,
      isSponsored: events.isSponsored,
      sponsorId: events.sponsorId,
      hidden: events.hidden,
      lastSeenAt: events.lastSeenAt,
    })
    .from(events)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(events.lastSeenAt))
    .limit(limit)
    .offset(offset);

  return c.json({ events: rows });
});

adminApp.get("/events/:id", async (c) => {
  const [row] = await db
    .select()
    .from(events)
    .where(eq(events.id, c.req.param("id")))
    .limit(1);
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({
    event: row,
    taxonomy: { interestCategories: INTEREST_CATEGORIES },
  });
});

adminApp.patch("/events/:id", async (c) => {
  const parsed = PatchEventSchema.parse(await c.req.json());
  const patch: Record<string, unknown> = {};
  if (parsed.title !== undefined) patch.title = parsed.title;
  if (parsed.description !== undefined) patch.description = parsed.description;
  if (parsed.categories !== undefined) patch.categories = parsed.categories;
  if (parsed.tags !== undefined) patch.tags = parsed.tags;
  if (parsed.imageUrl !== undefined) patch.imageUrl = parsed.imageUrl;
  if (parsed.url !== undefined) patch.url = parsed.url;
  if (parsed.neighborhood !== undefined) {
    patch.neighborhood = parsed.neighborhood;
  }
  if (parsed.hidden !== undefined) patch.hidden = parsed.hidden;
  if (parsed.isSponsored !== undefined) patch.isSponsored = parsed.isSponsored;
  if (parsed.sponsorId !== undefined) patch.sponsorId = parsed.sponsorId;
  if (parsed.boostWeight !== undefined) patch.boostWeight = parsed.boostWeight;
  if (parsed.sponsorEndsAt !== undefined) {
    patch.sponsorEndsAt = parsed.sponsorEndsAt
      ? new Date(parsed.sponsorEndsAt)
      : null;
  }

  if (!Object.keys(patch).length) {
    return c.json({ error: "No fields to update" }, 400);
  }

  const [row] = await db
    .update(events)
    .set(patch)
    .where(eq(events.id, c.req.param("id")))
    .returning();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ event: row });
});

adminApp.get("/stats/tag-coverage", async (c) => {
  const bySource = await db
    .select({
      source: events.source,
      total: sql<number>`count(*)::int`,
      missingCategories: sql<number>`count(*) filter (
        where ${events.categories} is null
           or jsonb_typeof(${events.categories}) <> 'array'
           or jsonb_array_length(${events.categories}) = 0
      )::int`,
      emptyTags: sql<number>`count(*) filter (
        where ${events.tags} is null
           or jsonb_typeof(${events.tags}) <> 'array'
           or jsonb_array_length(${events.tags}) = 0
      )::int`,
    })
    .from(events)
    .where(eq(events.hidden, false))
    .groupBy(events.source)
    .orderBy(desc(sql`count(*)`));

  return c.json({ bySource });
});

adminApp.get("/sponsors", async (c) => {
  const metro = c.req.query("metro");
  const pkg = c.req.query("package");
  const active = c.req.query("active");

  const filters = [];
  if (metro) filters.push(eq(sponsors.metro, metro));
  if (pkg) filters.push(eq(sponsors.package, pkg));
  if (active === "1" || active === "true") filters.push(eq(sponsors.active, true));
  if (active === "0" || active === "false") {
    filters.push(eq(sponsors.active, false));
  }

  const rows = await db
    .select()
    .from(sponsors)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(sponsors.createdAt));

  const ids = rows.map((r) => r.id);
  const boostCounts =
    ids.length === 0
      ? []
      : await db
          .select({
            sponsorId: events.sponsorId,
            count: count(),
          })
          .from(events)
          .where(
            and(inArray(events.sponsorId, ids), eq(events.isSponsored, true)),
          )
          .groupBy(events.sponsorId);

  const countMap = new Map(
    boostCounts.map((b) => [b.sponsorId, Number(b.count)]),
  );

  return c.json({
    sponsors: rows.map((s) => ({
      ...s,
      activeBoostCount: countMap.get(s.id) ?? 0,
    })),
  });
});

adminApp.post("/sponsors", async (c) => {
  const body = SponsorBodySchema.parse(await c.req.json());
  const [row] = await db
    .insert(sponsors)
    .values({
      name: body.name,
      metro: body.metro,
      package: body.package,
      contactEmail: body.contactEmail ?? null,
      notes: body.notes ?? null,
      active: body.active ?? true,
    })
    .returning();
  return c.json({ sponsor: row }, 201);
});

adminApp.get("/sponsors/:id", async (c) => {
  const [sponsor] = await db
    .select()
    .from(sponsors)
    .where(eq(sponsors.id, c.req.param("id")))
    .limit(1);
  if (!sponsor) return c.json({ error: "Not found" }, 404);

  const boosted = await db
    .select({
      id: events.id,
      title: events.title,
      source: events.source,
      city: events.city,
      startsAt: events.startsAt,
      isSponsored: events.isSponsored,
      boostWeight: events.boostWeight,
      sponsorEndsAt: events.sponsorEndsAt,
      hidden: events.hidden,
    })
    .from(events)
    .where(eq(events.sponsorId, sponsor.id))
    .orderBy(desc(events.boostWeight));

  return c.json({ sponsor, events: boosted });
});

adminApp.patch("/sponsors/:id", async (c) => {
  const body = SponsorBodySchema.partial().parse(await c.req.json());
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.metro !== undefined) patch.metro = body.metro;
  if (body.package !== undefined) patch.package = body.package;
  if (body.contactEmail !== undefined) patch.contactEmail = body.contactEmail;
  if (body.notes !== undefined) patch.notes = body.notes;
  if (body.active !== undefined) patch.active = body.active;

  if (!Object.keys(patch).length) {
    return c.json({ error: "No fields to update" }, 400);
  }

  const [row] = await db
    .update(sponsors)
    .set(patch)
    .where(eq(sponsors.id, c.req.param("id")))
    .returning();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ sponsor: row });
});

adminApp.post("/sponsors/:id/boosts", async (c) => {
  const sponsorId = c.req.param("id");
  const [sponsor] = await db
    .select()
    .from(sponsors)
    .where(eq(sponsors.id, sponsorId))
    .limit(1);
  if (!sponsor) return c.json({ error: "Sponsor not found" }, 404);

  const body = BoostSchema.parse(await c.req.json());
  const [row] = await db
    .update(events)
    .set({
      isSponsored: true,
      sponsorId,
      boostWeight: body.boostWeight ?? 1,
      sponsorEndsAt: body.sponsorEndsAt
        ? new Date(body.sponsorEndsAt)
        : null,
    })
    .where(eq(events.id, body.eventId))
    .returning();
  if (!row) return c.json({ error: "Event not found" }, 404);
  return c.json({ event: row });
});

adminApp.delete("/sponsors/:id/boosts/:eventId", async (c) => {
  const [row] = await db
    .update(events)
    .set({
      isSponsored: false,
      sponsorId: null,
      boostWeight: 1,
      sponsorEndsAt: null,
    })
    .where(
      and(
        eq(events.id, c.req.param("eventId")),
        eq(events.sponsorId, c.req.param("id")),
      ),
    )
    .returning();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ event: row });
});

adminApp.get("/stats/sponsors", async (c) => {
  const now = new Date();
  const [activeSponsors] = await db
    .select({ n: count() })
    .from(sponsors)
    .where(eq(sponsors.active, true));
  const [activeBoosts] = await db
    .select({ n: count() })
    .from(events)
    .where(
      and(
        eq(events.isSponsored, true),
        or(
          sql`${events.sponsorEndsAt} is null`,
          gte(events.sponsorEndsAt, now),
        )!,
      ),
    );
  const [staleBoosts] = await db
    .select({ n: count() })
    .from(events)
    .where(
      and(
        eq(events.isSponsored, true),
        isNotNull(events.sponsorEndsAt),
        lte(events.sponsorEndsAt, now),
      ),
    );
  const [totalEvents] = await db
    .select({ n: count() })
    .from(events)
    .where(eq(events.hidden, false));

  return c.json({
    activeSponsors: Number(activeSponsors?.n ?? 0),
    activeBoostedEvents: Number(activeBoosts?.n ?? 0),
    staleBoostedEvents: Number(staleBoosts?.n ?? 0),
    visibleEvents: Number(totalEvents?.n ?? 0),
  });
});

adminApp.post("/stats/sponsors/clear-stale", async (c) => {
  const now = new Date();
  const cleared = await db
    .update(events)
    .set({
      isSponsored: false,
      sponsorId: null,
      boostWeight: 1,
      sponsorEndsAt: null,
    })
    .where(
      and(
        eq(events.isSponsored, true),
        isNotNull(events.sponsorEndsAt),
        lte(events.sponsorEndsAt, now),
      ),
    )
    .returning({ id: events.id });
  return c.json({ cleared: cleared.length });
});

adminApp.get("/demotion-rules", async (c) => {
  const active = c.req.query("active");
  const filters = [];
  if (active === "1" || active === "true") {
    filters.push(eq(feedDemotionRules.active, true));
  }
  if (active === "0" || active === "false") {
    filters.push(eq(feedDemotionRules.active, false));
  }
  const rows = await db
    .select()
    .from(feedDemotionRules)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(feedDemotionRules.createdAt));
  const sourceRows = await db
    .select({
      source: events.source,
      n: count(),
    })
    .from(events)
    .where(eq(events.hidden, false))
    .groupBy(events.source)
    .orderBy(desc(count()));

  const sourceCount = new Map(
    sourceRows.map((r) => [r.source, Number(r.n)]),
  );
  // Prefer adapters that have data; still list known adapters with 0.
  const sources = [
    ...new Set([...sourceRows.map((r) => r.source), ...ALL_ADAPTER_IDS]),
  ]
    .sort((a, b) => (sourceCount.get(b) ?? 0) - (sourceCount.get(a) ?? 0) || a.localeCompare(b))
    .map((id) => ({ id, count: sourceCount.get(id) ?? 0 }));

  return c.json({
    rules: rows,
    feedAreas: FEED_AREAS,
    sources,
    categories: [...INTEREST_CATEGORIES],
  });
});

/** Venue name typeahead for demotion (and other ops) forms. */
adminApp.get("/venues/suggest", async (c) => {
  const q = c.req.query("q")?.trim() ?? "";
  const metro = c.req.query("metro")?.trim().toLowerCase() || null;
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 12), 1), 30);
  if (q.length < 2) {
    return c.json({ venues: [] as { venueName: string; count: number }[] });
  }

  const like = `%${q}%`;
  const rows = await db
    .select({
      venueName: events.venueName,
      city: events.city,
      n: count(),
    })
    .from(events)
    .where(
      and(
        eq(events.hidden, false),
        isNotNull(events.venueName),
        sql`length(trim(${events.venueName})) > 0`,
        ilike(events.venueName, like),
      ),
    )
    .groupBy(events.venueName, events.city)
    .orderBy(desc(count()))
    .limit(100);

  const areaFilter =
    metro && (FEED_AREAS as readonly string[]).includes(metro)
      ? (metro as FeedArea)
      : null;

  const byVenue = new Map<string, number>();
  for (const r of rows) {
    const name = r.venueName?.trim();
    if (!name) continue;
    if (areaFilter && !eventInArea(areaFilter, { city: r.city })) continue;
    if (metro && !areaFilter && !demotionMetroMatches(metro, r.city)) continue;
    byVenue.set(name, (byVenue.get(name) ?? 0) + Number(r.n));
  }

  const venues = [...byVenue.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([venueName, n]) => ({ venueName, count: n }));

  return c.json({ venues });
});

adminApp.post("/demotion-rules", async (c) => {
  const body = DemotionRuleBodySchema.parse(await c.req.json());
  const [row] = await db
    .insert(feedDemotionRules)
    .values({
      name: body.name,
      metro: body.metro,
      source: body.source,
      venueContains: body.venueContains,
      categoryContains: body.categoryContains,
      scoreMultiplier: body.scoreMultiplier,
      maxPerVenue: body.maxPerVenue,
      notes: body.notes,
      active: body.active ?? true,
    })
    .returning();
  return c.json({ rule: row }, 201);
});

adminApp.patch("/demotion-rules/:id", async (c) => {
  const body = DemotionRuleFieldsSchema.partial().parse(await c.req.json());
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) patch.name = body.name;
  if (body.metro !== undefined) patch.metro = body.metro;
  if (body.source !== undefined) patch.source = body.source;
  if (body.venueContains !== undefined) patch.venueContains = body.venueContains;
  if (body.categoryContains !== undefined) {
    patch.categoryContains = body.categoryContains;
  }
  if (body.scoreMultiplier !== undefined) {
    patch.scoreMultiplier = body.scoreMultiplier;
  }
  if (body.maxPerVenue !== undefined) patch.maxPerVenue = body.maxPerVenue;
  if (body.notes !== undefined) patch.notes = body.notes;
  if (body.active !== undefined) patch.active = body.active;

  if (Object.keys(patch).length <= 1) {
    return c.json({ error: "No fields to update" }, 400);
  }

  // Re-check match fields if any were cleared
  const [existing] = await db
    .select()
    .from(feedDemotionRules)
    .where(eq(feedDemotionRules.id, c.req.param("id")))
    .limit(1);
  if (!existing) return c.json({ error: "Not found" }, 404);

  const merged = {
    metro: body.metro !== undefined ? body.metro : existing.metro,
    source: body.source !== undefined ? body.source : existing.source,
    venueContains:
      body.venueContains !== undefined
        ? body.venueContains
        : existing.venueContains,
    categoryContains:
      body.categoryContains !== undefined
        ? body.categoryContains
        : existing.categoryContains,
  };
  if (
    !merged.metro &&
    !merged.source &&
    !merged.venueContains &&
    !merged.categoryContains
  ) {
    return c.json(
      {
        error:
          "At least one match field required (metro, source, venue, or category)",
      },
      400,
    );
  }

  const [row] = await db
    .update(feedDemotionRules)
    .set(patch)
    .where(eq(feedDemotionRules.id, c.req.param("id")))
    .returning();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ rule: row });
});

adminApp.delete("/demotion-rules/:id", async (c) => {
  const deleted = await db
    .delete(feedDemotionRules)
    .where(eq(feedDemotionRules.id, c.req.param("id")))
    .returning({ id: feedDemotionRules.id });
  if (!deleted.length) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

adminApp.get("/stats/outbound", async (c) => {
  const days = Math.min(Number(c.req.query("days") ?? 30), 90);
  const city = c.req.query("city");
  const sponsorId = c.req.query("sponsorId");
  const since = new Date(Date.now() - days * 86400000);

  let sponsorEventIds: string[] | null = null;
  if (sponsorId) {
    const linked = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.sponsorId, sponsorId));
    sponsorEventIds = linked.map((r) => r.id);
    if (!sponsorEventIds.length) {
      return c.json({
        days,
        total: 0,
        byDay: [],
        byCity: [],
        bySource: [],
        byNetwork: [],
        byHost: [],
        topEvents: [],
      });
    }
  }

  const baseFilters = [
    gte(outboundClicks.createdAt, since),
    city ? eq(outboundClicks.city, city) : undefined,
    sponsorEventIds
      ? and(
          eq(outboundClicks.targetKind, "event"),
          inArray(outboundClicks.targetId, sponsorEventIds),
        )
      : undefined,
  ].filter(Boolean);

  const where = baseFilters.length ? and(...baseFilters) : undefined;

  const [totalRow] = await db
    .select({ n: count() })
    .from(outboundClicks)
    .where(where);

  const byDay = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${outboundClicks.createdAt}), 'YYYY-MM-DD')`,
      n: count(),
    })
    .from(outboundClicks)
    .where(where)
    .groupBy(sql`date_trunc('day', ${outboundClicks.createdAt})`)
    .orderBy(asc(sql`date_trunc('day', ${outboundClicks.createdAt})`));

  const byCity = await db
    .select({ city: outboundClicks.city, n: count() })
    .from(outboundClicks)
    .where(where)
    .groupBy(outboundClicks.city)
    .orderBy(desc(count()));

  const bySource = await db
    .select({ source: outboundClicks.source, n: count() })
    .from(outboundClicks)
    .where(where)
    .groupBy(outboundClicks.source)
    .orderBy(desc(count()));

  const byNetwork = await db
    .select({
      affiliateNetwork: outboundClicks.affiliateNetwork,
      n: count(),
    })
    .from(outboundClicks)
    .where(where)
    .groupBy(outboundClicks.affiliateNetwork)
    .orderBy(desc(count()));

  const byHost = await db
    .select({
      destinationHost: outboundClicks.destinationHost,
      n: count(),
    })
    .from(outboundClicks)
    .where(where)
    .groupBy(outboundClicks.destinationHost)
    .orderBy(desc(count()))
    .limit(20);

  const topEvents = await db
    .select({
      targetId: outboundClicks.targetId,
      n: count(),
    })
    .from(outboundClicks)
    .where(
      and(where, eq(outboundClicks.targetKind, "event")),
    )
    .groupBy(outboundClicks.targetId)
    .orderBy(desc(count()))
    .limit(15);

  const eventIds = topEvents.map((t) => t.targetId);
  const titles =
    eventIds.length === 0
      ? []
      : await db
          .select({ id: events.id, title: events.title })
          .from(events)
          .where(inArray(events.id, eventIds));
  const titleMap = new Map(titles.map((t) => [t.id, t.title]));

  return c.json({
    days,
    total: Number(totalRow?.n ?? 0),
    byDay: byDay.map((r) => ({ day: r.day, n: Number(r.n) })),
    byCity: byCity.map((r) => ({ city: r.city, n: Number(r.n) })),
    bySource: bySource.map((r) => ({ source: r.source, n: Number(r.n) })),
    byNetwork: byNetwork.map((r) => ({
      affiliateNetwork: r.affiliateNetwork,
      n: Number(r.n),
    })),
    byHost: byHost.map((r) => ({
      destinationHost: r.destinationHost,
      n: Number(r.n),
    })),
    topEvents: topEvents.map((t) => ({
      eventId: t.targetId,
      title: titleMap.get(t.targetId) ?? null,
      n: Number(t.n),
    })),
  });
});
