// Production entry. src/generated/ is written by `python -m pipeline.export_edge` (run it before deploying).
import { createApp } from "./app";
import { Content, type Linking, type Manifest, type QuestionText } from "./content";
import type { KnowledgeData, Meta } from "./env";
import bank from "./generated/bank.json";
import knowledge from "./generated/knowledge.json";
import manifest from "./generated/manifest.json";
import meta from "./generated/meta.json";
import sections from "./generated/sections.json";

export default createApp({
  content: new Content(manifest as unknown as Manifest, sections as Linking, bank as unknown as Record<string, QuestionText>),
  knowledge: knowledge as KnowledgeData,
  meta: meta as Meta,
});
