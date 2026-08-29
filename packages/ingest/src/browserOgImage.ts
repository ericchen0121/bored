import {
  chromium,
  type Browser,
  type BrowserContext,
} from "playwright";
import {
  normalizeFetchedImageUrl,
  unwrapTicketUrl,
} from "./ticketPageImage.js";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Hosts where plain fetch is blocked / empty but a real browser often sees
 * og:image. Skip Instagram/Facebook — login walls, low success, ToS pain.
 * Shared across metros (19hz SF + CHI, future city calendars).
 */
export const BROWSER_IMAGE_HOST_RES: RegExp[] = [
  /(?:^|\.)tixr\.com$/i,
  /(?:^|\.)(?:wl\.)?eventim\.(?:us|com)$/i,
  /(?:^|\.)axs\.com$/i,
  /(?:^|\.)ticketmaster\.com$/i,
  /(?:^|\.)ticketweb\.com$/i,
  /(?:^|\.)etix\.com$/i,
  /(?:^|\.)(?:prod-nts-api\.)?seetickets(?:usa)?\.(?:us|com)$/i,
  /(?:^|\.)dnalounge\.com$/i,
  /(?:^|\.)thebloxoffice\.com$/i,
  /(?:^|\.)ticketleap\.com$/i,
  /(?:^|\.)eventim\.us$/i,
];

const SOCIAL_HOST =
  /(?:^|\.)(?:instagram\.com|facebook\.com|fb\.com|fb\.me)$/i;

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}

/** Default on; set `BROWSER_IMAGE_SCRAPE=0` to disable on hosts without Chromium. */
export function browserImageScrapeEnabled(): boolean {
  const v = (process.env.BROWSER_IMAGE_SCRAPE ?? "1").toLowerCase().trim();
  return v !== "0" && v !== "false" && v !== "off" && v !== "no";
}

export function browserImageScrapeCap(): number {
  const n = Number(process.env.BROWSER_IMAGE_SCRAPE_CAP ?? "40");
  if (!Number.isFinite(n) || n <= 0) return 40;
  return Math.min(Math.floor(n), 200);
}

export function browserImageScrapeConcurrency(): number {
  const n = Number(process.env.BROWSER_IMAGE_SCRAPE_CONCURRENCY ?? "2");
  if (!Number.isFinite(n) || n <= 0) return 2;
  return Math.min(Math.floor(n), 4);
}

export function isBrowserImageHost(url: string): boolean {
  const host = hostOf(unwrapTicketUrl(url));
  if (!host || SOCIAL_HOST.test(host)) return false;
  return BROWSER_IMAGE_HOST_RES.some((re) => re.test(host));
}

/**
 * Shared Chromium context for a batch of ticket-page og:image scrapes.
 * Launch once per ingest/backfill pass — not per URL, not on the API process.
 */
export class BrowserOgScraper {
  private constructor(
    private readonly browser: Browser,
    private readonly context: BrowserContext,
  ) {}

  static async create(): Promise<BrowserOgScraper | null> {
    if (!browserImageScrapeEnabled()) return null;
    try {
      const browser = await chromium.launch({
        headless: true,
        args: [
          "--disable-dev-shm-usage",
          "--no-sandbox",
          "--disable-blink-features=AutomationControlled",
        ],
      });
      const context = await browser.newContext({
        userAgent: BROWSER_UA,
        viewport: { width: 1280, height: 720 },
        locale: "en-US",
      });
      context.setDefaultTimeout(20_000);
      return new BrowserOgScraper(browser, context);
    } catch (err) {
      console.warn(
        "[browser-og] Chromium unavailable — install with: pnpm --filter @bored/ingest exec playwright install chromium",
        err instanceof Error ? err.message : err,
      );
      return null;
    }
  }

  async scrape(url: string): Promise<string | null> {
    const target = unwrapTicketUrl(url);
    if (!isBrowserImageHost(target)) return null;

    const page = await this.context.newPage();
    try {
      await page.goto(target, {
        waitUntil: "domcontentloaded",
        timeout: 25_000,
      });
      // SPAs (Tixr/AXS/Eventim) inject og tags after hydration.
      await page
        .waitForSelector('meta[property="og:image"], meta[name="twitter:image"]', {
          timeout: 8_000,
        })
        .catch(() => undefined);
      await new Promise((r) => setTimeout(r, 600));
      const finalUrl = page.url();
      // String form avoids tsx/esbuild injecting `__name` into page.evaluate.
      const raw = (await page.evaluate(`(() => {
        const pick = (sel) =>
          document.querySelector(sel)?.getAttribute("content")?.trim() || null;
        const og =
          pick('meta[property="og:image"]') ||
          pick('meta[property="og:image:url"]') ||
          pick('meta[property="og:image:secure_url"]') ||
          pick('meta[name="twitter:image"]') ||
          pick('meta[name="twitter:image:src"]');
        if (og) return og;
        let best = null;
        for (const img of document.querySelectorAll("img")) {
          const src = img.currentSrc || img.src;
          if (!src || src.startsWith("data:")) continue;
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;
          const area = w * h;
          if (area < 40000) continue;
          if (!best || area > best.area) best = { src, area };
        }
        return best ? best.src : null;
      })()`)) as string | null;
      if (!raw || raw.startsWith("data:")) return null;
      return normalizeFetchedImageUrl(raw, finalUrl);
    } catch (err) {
      if (process.env.BROWSER_IMAGE_DEBUG === "1") {
        console.warn(
          "[browser-og] scrape failed",
          target.slice(0, 80),
          err instanceof Error ? err.message : err,
        );
      }
      return null;
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async close(): Promise<void> {
    await Promise.race([
      (async () => {
        await this.context.close().catch(() => undefined);
        await this.browser.close().catch(() => undefined);
      })(),
      new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
    ]);
  }
}
