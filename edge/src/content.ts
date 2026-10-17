/** The read-only question bank, generated from content/manifest.json by `python -m pipeline.export_edge`. */
export interface Img {
  src: string;
  w: number;
  h: number;
}

export interface ManifestQuestion {
  num: number;
  chapter: string;
  kp: string;
  section: string;
  path: string[];
  source: string;
  source_full: string;
  orig_page: number;
  difficulty: number;
  stars: number;
  minutes: number;
  quick_id: string;
  flags: string[];
  img: Img;
  answer: Img;
  solution: Img[];
}

export type Question = ManifestQuestion;

export interface ChapterInfo {
  code: string;
  name: string;
  first: number;
  last: number;
}

export interface KnowledgeEntry {
  slug: string;
  title: string;
  group: string;
  md: string | null;
  pages: Img[];
  toc?: { title: string; page: number }[];
}

export interface Manifest {
  version: number;
  built_at: string;
  chapters: ChapterInfo[];
  chapter_links: Record<string, string[]>;
  questions: ManifestQuestion[];
  knowledge: KnowledgeEntry[];
  alignment: { weak: number[]; skipped: string[] };
}

export type Outline = [section: string, kps: [kp: string, questions: Question[]][]][];

/** A numbered h2/h3 of the knowledge Markdown (see dgy/sections.py), keyed like "01/7.3". */
export interface Section {
  key: string;
  slug: string;
  number: string;
  level: number;
  title: string;
  anchor: string;
  pdf_page: number | null;
  page_index: number | null;
  parent: string | null;
}

/** generated/sections.json: the sections and each question's section keys, main one first. */
export interface Linking {
  sections: Section[];
  links: Record<string, string[]>;
}

const MAX_LINKS = 3;

export const sectionLabel = (s: Section) => `${s.number} ${s.title.replaceAll("$", "")}`;

export class Content {
  readonly chapters: ChapterInfo[];
  readonly questions: Map<number, Question>;
  readonly knowledge: KnowledgeEntry[];
  readonly chapterLinks: Record<string, string[]>;
  readonly builtAt: string;
  readonly sections: Map<string, Section>;
  private readonly ordered: Question[];
  private readonly links = new Map<number, string[]>();
  private readonly linked = new Map<string, number[]>();

  constructor(manifest: Manifest, linking: Linking = { sections: [], links: {} }) {
    this.chapters = manifest.chapters;
    this.ordered = [...manifest.questions].sort((a, b) => a.num - b.num);
    this.questions = new Map(this.ordered.map((q) => [q.num, q]));
    this.knowledge = manifest.knowledge;
    this.chapterLinks = manifest.chapter_links;
    this.builtAt = manifest.built_at;
    this.sections = new Map(linking.sections.map((s) => [s.key, s]));
    for (const [num, keys] of Object.entries(linking.links).sort(([a], [b]) => Number(a) - Number(b))) {
      const kept = keys.filter((k) => this.sections.has(k)).slice(0, MAX_LINKS);
      if (!this.questions.has(Number(num)) || !kept.length) continue;
      this.links.set(Number(num), kept);
      for (const key of kept) {
        if (!this.linked.has(key)) this.linked.set(key, []);
        this.linked.get(key)!.push(Number(num));
      }
    }
  }

  all(): Question[] {
    return this.ordered;
  }

  hasChapter(code: string): boolean {
    return this.chapters.some((c) => c.code === code);
  }

  chapter(code: string): ChapterInfo {
    const found = this.chapters.find((c) => c.code === code);
    if (!found) throw new Error(`unknown chapter ${code}`);
    return found;
  }

  inChapter(code: string): Question[] {
    return this.ordered.filter((q) => q.chapter === code);
  }

  defaultExcluded(): Set<number> {
    return new Set(this.ordered.filter((q) => q.flags.includes("仅数一")).map((q) => q.num));
  }

  /** Sections of a chapter, each with its 考点 and their questions, in book order. */
  outline(code: string): Outline {
    const sections = new Map<string, Map<string, Question[]>>();
    for (const q of this.inChapter(code)) {
      if (!sections.has(q.section)) sections.set(q.section, new Map());
      const kps = sections.get(q.section)!;
      if (!kps.has(q.kp)) kps.set(q.kp, []);
      kps.get(q.kp)!.push(q);
    }
    return [...sections].map(([section, kps]) => [section, [...kps]]);
  }

  knowledgeEntry(slug: string): KnowledgeEntry | undefined {
    return this.knowledge.find((k) => k.slug === slug);
  }

  knowledgeFor(chapter: string): KnowledgeEntry[] {
    return (this.chapterLinks[chapter] ?? []).map((slug) => this.knowledgeEntry(slug)).filter((k) => k !== undefined);
  }

  knowledgeTitles(): Record<string, string> {
    return Object.fromEntries(this.knowledge.map((k) => [k.slug, k.title]));
  }

  /** The knowledge sections a question is tagged with, main one first. */
  sectionsFor(num: number): Section[] {
    return (this.links.get(num) ?? []).map((key) => this.sections.get(key)!);
  }

  /** Questions tagged with a section, in number order. */
  questionsFor(key: string): number[] {
    return this.linked.get(key) ?? [];
  }

  /** Questions tagged with any section that starts on this 原版 page of a chapter. */
  questionsOnPage(slug: string, pageIndex: number): number[] {
    const nums = new Set<number>();
    for (const s of this.sections.values()) {
      if (s.slug === slug && s.page_index === pageIndex) for (const n of this.questionsFor(s.key)) nums.add(n);
    }
    return [...nums].sort((a, b) => a - b);
  }
}
