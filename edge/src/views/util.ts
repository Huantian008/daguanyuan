import type { HtmlEscapedString } from "hono/utils/html";
import type { Meta } from "../env";

export type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

export const pad3 = (n: number) => String(n).padStart(3, "0");
export const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);
/** Rounded half up, like the Python version (round() would round 2.5 down). */
export const minutes = (seconds: number | null | undefined) => Math.floor(((seconds ?? 0) + 30) / 60);
export const duration = (seconds: number | null | undefined) =>
  !seconds ? "" : seconds < 60 ? `${seconds} 秒` : `${minutes(seconds)} 分钟`;

export const contentUrl = (meta: Meta, src: string) => `/content/${src}?v=${meta.content_v}`;
export const staticUrl = (meta: Meta, path: string) => `/static/${path}?v=${meta.asset_v}`;

/** Only allow redirects to paths on this site. */
export const safeBack = (url: string | undefined | null, fallback = "/") =>
  url && url.startsWith("/") && !url.startsWith("//") ? url : fallback;
