/** Bindings configured in wrangler.jsonc, plus the two secrets set with `wrangler secret put`. */
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_PASSWORD?: string;
  SECRET_KEY?: string;
}

/** URL version stamps written by `python -m pipeline.export_edge`. */
export interface Meta {
  content_v: string;
  asset_v: string;
}

/** Knowledge Markdown pre-rendered to HTML by the Python exporter. */
export interface KnowledgeData {
  chapters: Record<string, { html: string; toc: string[][] }>;
  overview: string;
}
