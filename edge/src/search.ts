import type { Question, QuestionText } from "./content";

export const STATUSES = ["all", "new", "unknown", "shaky", "mastered", "excluded"];
export const SUBJECTS = ["all", "gaoshu", "xiandai"];
export const normalize = (value: string): string => value.normalize("NFKC").toLowerCase();

export function matches(q: Question, text: QuestionText | undefined, query: string, subject: string, status: string, current: string): boolean {
  if (subject !== "all" && (q.chapter.startsWith("L") ? "xiandai" : "gaoshu") !== subject) return false;
  if (status !== "all" && current !== status) return false;
  const haystack = [q.source_full, q.source, q.kp, q.section, text?.search ?? ""].map((s) => normalize(s).replace(/\s+/g, "")).join(" ");
  return normalize(query).trim().split(/\s+/).filter(Boolean).every((t) => haystack.includes(t));
}
