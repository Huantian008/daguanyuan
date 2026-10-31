import type { User } from "./users";

/** Bindings configured in wrangler.jsonc, plus the secrets set with `wrangler secret put`. */
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** The accounts (see users.ts): an array in wrangler.jsonc vars, or JSON text in .dev.vars. */
  USERS?: unknown;
  /** Passwords, one secret per account; `password_secret` in USERS says whose is whose. */
  APP_PASSWORD?: string;
  FRIEND_PASSWORD?: string;
  /** Signs the login cookies. */
  SECRET_KEY?: string;
}

/** What the Worker's routes see: the bindings, and the logged-in user once the access check has passed. */
export type AppEnv = { Bindings: Env; Variables: { user: User } };

/** URL version stamps written by `python -m pipeline.export_edge`. */
export interface Meta {
  content_v: string;
  asset_v: string;
  /** Account bound to the rendered page; absent on login/public pages. */
  grade_owner?: string;
  study_day?: string;
}

/** Knowledge Markdown pre-rendered to HTML by the Python exporter. */
export interface KnowledgeData {
  chapters: Record<string, { html: string; toc: string[][] }>;
  overview: string;
}
