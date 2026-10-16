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

export class Content {
  readonly chapters: ChapterInfo[];
  readonly questions: Map<number, Question>;
  readonly knowledge: KnowledgeEntry[];
  readonly chapterLinks: Record<string, string[]>;
  readonly builtAt: string;
  private readonly ordered: Question[];

  constructor(manifest: Manifest) {
    this.chapters = manifest.chapters;
    this.ordered = [...manifest.questions].sort((a, b) => a.num - b.num);
    this.questions = new Map(this.ordered.map((q) => [q.num, q]));
    this.knowledge = manifest.knowledge;
    this.chapterLinks = manifest.chapter_links;
    this.builtAt = manifest.built_at;
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
}
