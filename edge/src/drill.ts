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

/** The ?kp= of the 考点 a question is in. */
export const kpIndexOf = (content: Content, code: string, section: string, kp: string, status: (num: number) => Status): number =>
  drillKps(content, code, status).find((k) => k.section === section && k.kp === kp)?.index ?? 1;

/**
 * Where 继续往下做 goes: the first 考点 with a question not done yet, from the one `last` is in onwards through the
 * book, round again from the start; from the very first 考点 when there is no `last`. Null when everything is done.
 */
export function onwardKp(content: Content, status: (num: number) => Status, last?: Question): { code: string; kp: DrillKp } | null {
  const codes = content.chapters.map((ch) => ch.code);
  const start = last ? codes.indexOf(last.chapter) : 0;
  const at = last ? drillKps(content, last.chapter, status).findIndex((k) => k.questions.includes(last)) : 0;
  for (let step = 0; step <= codes.length; step++) {
    const code = codes[(start + step) % codes.length];
    const kps = drillKps(content, code, status);
    // the starting chapter is looked at twice: from `last`'s 考点 on, and at the end the 考点 before it
    const range = step === 0 ? kps.slice(at) : step === codes.length ? kps.slice(0, at) : kps;
    const kp = range.find((k) => k.done < k.total);
    if (kp) return { code, kp };
  }
  return null;
}

export function kpTree(kps: DrillKp[]): [string, DrillKp[]][] {
  const tree: [string, DrillKp[]][] = [];
  for (const k of kps) {
    if (!tree.length || tree[tree.length - 1][0] !== k.section) tree.push([k.section, []]);
    tree[tree.length - 1][1].push(k);
  }
  return tree;
}
