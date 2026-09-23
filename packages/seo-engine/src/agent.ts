/**
 * Module 18 — future SEO Agent. Interfaces only (deliberately): the Shorts
 * pipeline comes first. Each connector will be implemented behind these
 * contracts; nothing here fabricates data.
 */

export interface DateRange {
  start: string; // YYYY-MM-DD
  end: string;
}

export interface SearchConsoleRow {
  query: string;
  page: string | null;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchConsoleConnector {
  readonly kind: "search-console";
  listSites(): Promise<string[]>;
  queryPerformance(site: string, range: DateRange, dimensions: ("query" | "page" | "country" | "device")[]): Promise<SearchConsoleRow[]>;
}

export interface AnalyticsConnector {
  readonly kind: "analytics";
  pageViews(propertyId: string, range: DateRange, pagePathPrefix?: string): Promise<{ path: string; views: number; users: number }[]>;
}

export interface PageSpeedConnector {
  readonly kind: "pagespeed";
  audit(url: string, strategy: "mobile" | "desktop"): Promise<{ performance: number; lcpMs: number; cls: number; inpMs: number | null }>;
}

export interface BusinessProfileConnector {
  readonly kind: "business-profile";
  locations(): Promise<{ name: string; address: string; primaryCategory: string }[]>;
}

export interface CrawledPage {
  url: string;
  status: number;
  title: string | null;
  metaDescription: string | null;
  h1: string[];
  canonical: string | null;
  lang: string | null;
  links: string[];
}

export interface SitemapCrawler {
  readonly kind: "sitemap";
  urls(sitemapUrl: string): Promise<string[]>;
}

export interface WebsiteCrawler {
  readonly kind: "crawler";
  crawl(startUrl: string, opts: { maxPages: number; sameOrigin: boolean }): AsyncIterable<CrawledPage>;
}

export type SeoConnector = SearchConsoleConnector | AnalyticsConnector | PageSpeedConnector | BusinessProfileConnector | SitemapCrawler | WebsiteCrawler;

/** Registry the agent will read from; empty until connectors are configured. */
export class ConnectorRegistry {
  private readonly items = new Map<SeoConnector["kind"], SeoConnector>();
  register(c: SeoConnector): void {
    this.items.set(c.kind, c);
  }
  get<K extends SeoConnector["kind"]>(kind: K): Extract<SeoConnector, { kind: K }> | null {
    return (this.items.get(kind) as Extract<SeoConnector, { kind: K }>) ?? null;
  }
  get configured(): SeoConnector["kind"][] {
    return [...this.items.keys()];
  }
}
