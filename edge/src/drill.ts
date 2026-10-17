/** The chapter page as a drill: one 考点 at a time with its questions laid out, and a tree of the chapter's 考点. Port of dgy/drill.py. */
import type { Content, Question } from "./content";
import type { Status } from "./views/parts";

export interface DrillKp {
  /** 1-based over the whole chapter, the value of ?kp= */
  index: number;
  section: string;
  kp: string;
  questions: Question[];
  /** questions that are not excluded and have been graded at least once */
  done: number;
  /** questions that are not excluded */
  total: number;
}

/** Every 考点 of a chapter in book order; `status(num)` is the question's status (excluded / new / …). */
export function drillKps(content: Content, code: string, status: (num: number) => Status): DrillKp[] {
  const kps: DrillKp[] = [];
  for (const [section, items] of content.outline(code)) {
    for (const [kp, questions] of items) {
      const open = questions.filter((q) => status(q.num) !== "excluded");
      kps.push({
        index: kps.length + 1, section, kp, questions,
        done: open.filter((q) => status(q.num) !== "new").length, total: open.length,
      });
    }
  }
  return kps;
}

/** The first 考点 that still has a question not done yet, else the first one. */
export const defaultKp = (kps: DrillKp[]): number => kps.find((k) => k.done < k.total)?.index ?? 1;

export function kpTree(kps: DrillKp[]): [string, DrillKp[]][] {
  const tree: [string, DrillKp[]][] = [];
  for (const k of kps) {
    if (!tree.length || tree[tree.length - 1][0] !== k.section) tree.push([k.section, []]);
    tree[tree.length - 1][1].push(k);
  }
  return tree;
}
