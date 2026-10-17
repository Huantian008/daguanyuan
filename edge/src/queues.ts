/** Decide which questions a practice session contains. */
import type { Content } from "./content";
import type { CardState } from "./srs";
import { dueQueue, warmupQueue, type Review } from "./stats";
import type { Day } from "./studyday";

export type Mode = "warmup" | "due" | "group" | "single" | "random";

/** A hand-picked list longer than this is titled by its first question and the count. */
const SINGLE_TITLE_MAX = 5;
export type Only = "all" | "new" | "weak";

export interface QueueSpec {
  mode: Mode;
  chapter?: string;
  section?: string;
  kp?: string;
  only: Only;
  nums: number[];
  count: number;
}

const pad = (n: number) => String(n).padStart(3, "0");

function keep(num: number, only: Only, cards: Map<number, CardState>): boolean {
  const card = cards.get(num);
  if (only === "new") return !card || card.reps === 0;
  if (only === "weak") return !!card && (card.lastGrade === "shaky" || card.lastGrade === "unknown");
  return true;
}

function groupTitle(content: Content, spec: QueueSpec): string {
  const parts = [spec.chapter ? content.chapter(spec.chapter).name : "全部章节", spec.section, spec.kp].filter(Boolean);
  const title = parts.join(" / ");
  if (spec.only === "new") return `${title}（没做过的）`;
  if (spec.only === "weak") return `巩固 · ${title}`;
  return title;
}

export function buildQueue(spec: QueueSpec, content: Content, cards: Map<number, CardState>, reviews: Review[],
  excluded: Set<number>, today: Day, warmupDays: number, rng: () => number = Math.random): { title: string; nums: number[] } {
  const active = new Set(content.all().map((q) => q.num).filter((n) => !excluded.has(n)));
  switch (spec.mode) {
    case "warmup":
      return { title: "热身 · 重做前几天的题", nums: warmupQueue(reviews, active, today, warmupDays) };
    case "due":
      return { title: "到期复习", nums: dueQueue(cards, active, today) };
    case "single": {
      const nums = spec.nums.filter((n) => content.questions.has(n));
      const title = nums.length > SINGLE_TITLE_MAX ? `#${pad(nums[0])} 等 ${nums.length} 题` : nums.map((n) => `#${pad(n)}`).join("、");
      return { title, nums };
    }
    case "random": {
      const pool = [...active].filter((n) => keep(n, spec.only, cards)).sort((a, b) => a - b);
      const take = Math.min(spec.count, pool.length);
      for (let i = 0; i < take; i++) {
        const j = i + Math.floor(rng() * (pool.length - i));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      return { title: `随机 ${take} 题`, nums: pool.slice(0, take) };
    }
    case "group": {
      const nums = content.all()
        .filter((q) => active.has(q.num)
          && (!spec.chapter || q.chapter === spec.chapter)
          && (!spec.section || q.section === spec.section)
          && (!spec.kp || q.kp === spec.kp)
          && keep(q.num, spec.only, cards))
        .map((q) => q.num);
      return { title: groupTitle(content, spec), nums };
    }
  }
}
