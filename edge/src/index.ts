// Production entry. src/generated/ is written by `python -m pipeline.export_edge` (run it before deploying).
import { createApp } from "./app";
import { Content, type Manifest } from "./content";
import type { KnowledgeData, Meta } from "./env";
import knowledge from "./generated/knowledge.json";
import manifest from "./generated/manifest.json";
import meta from "./generated/meta.json";

export default createApp({
  content: new Content(manifest as unknown as Manifest),
  knowledge: knowledge as KnowledgeData,
  meta: meta as Meta,
});
