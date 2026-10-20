/** Page routes, ported from dgy/routes/*.py. */
import type { Hono } from "hono";
import { parseLabel, type Content, type KnowledgeEntry } from "./content";
import * as db from "./db";
import { defaultKp, drillKps, kpIndexOf, kpTree, onwardKp } from "./drill";
import type { AppEnv, KnowledgeData, Meta } from "./env";
import { isGrade } from "./srs";
import { examDate, loadState, warmupDays } from "./state";
import * as stats from "./stats";
import { addDays, calendarDay, daysBetween, studyDay } from "./studyday";
import { bankPage, chapterPage, questionPage, searchPage } from "./views/bank";
import { dashboardPage } from "./views/dashboard";
import { historyPage, settingsPage, type HistoryDay } from "./views/history";
import { injectSectionQuestions, knowledgeIndexPage, knowledgePage } from "./views/knowledge";
import { isReviewMode, reviewPage } from "./views/review";
import { safeBack } from "./views/util";

const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const intOrNull = (value: unknown): number | null => (/^\d+$/.test(str(value)) ? Number(str(value)) : null);
const numList = (value: unknown) => str(value).split(",").map(intOrNull).filter((n): n is number => n !== null && n > 0);

export interface PageDeps {
  content: Content;
  knowledge: KnowledgeData;
  meta: Meta;
  now: () => Date;
}

export function registerPages(app: Hono<AppEnv>, { content, knowledge, meta, now }: PageDeps) {
  const today = () => studyDay(now());

  app.get("/", async (c) => {
    const DB = c.env.DB;
    const uid = c.get("user").id;
    const day = today();
    const [state, reviews, exam, warmup] = await Promise.all([
      loadState(DB, uid, content), db.reviewLog(DB, uid, addDays(day, -400)), examDate(DB, uid), warmupDays(DB, uid),
    ]);
    const last = stats.lastDrilled(reviews, (num) => content.questions.has(num));
    const onward = onwardKp(content, state.status, last === undefined ? undefined : content.questions.get(last));
    const date = calendarDay(now());
    return c.html(dashboardPage(meta, {
      date,
      daysLeft: daysBetween(date, exam),
      warmup: stats.warmupQueue(reviews, state.active, day, warmup),
      due: stats.dueQueue(state.cards, state.active, day),
      onward: onward && { ...onward, name: content.chapter(onward.code).name, resumed: last !== undefined },
      progress: stats.chapterProgress(content, state.cards, state.excluded),
      dist: stats.masteryDistribution(state.active, state.cards),
      activeTotal: state.active.size,
      weak: stats.weakSpots(content, state.cards, state.excluded, 3)
        .map((w): [stats.WeakSpot, number] => [w, kpIndexOf(content, w.chapter, w.section, w.kp, state.status)]),
      chapterNames: Object.fromEntries(content.chapters.map((ch) => [ch.code, ch.name])),
      totals: stats.dailyTotals(reviews, day, 30),
      streak: stats.streak(new Set(reviews.map((r) => r.studyDay)), day),
    }));
  });

  // Warm-up and due review, laid out as cards like the chapter page.
  app.get("/review/:mode", async (c) => {
    const mode = c.req.param("mode");
    if (!isReviewMode(mode)) return c.notFound();
    const DB = c.env.DB;
    const uid = c.get("user").id;
    const day = today();
    const [state, reviews, warmup, gradedToday] = await Promise.all([
      loadState(DB, uid, content), db.reviewLog(DB, uid, addDays(day, -60)), warmupDays(DB, uid), db.gradedOn(DB, uid, day),
    ]);
    const queue = mode === "warmup" ? stats.warmupQueue(reviews, state.active, day, warmup) : stats.dueQueue(state.cards, state.active, day);
    const nums = stats.reviewList(reviews, mode, day, queue);
    return c.html(reviewPage(meta, {
      mode, questions: nums.map((n) => content.questions.get(n)!), state, texts: content.texts, gradedToday,
      sections: new Map(nums.map((n) => [n, content.sectionsFor(n)])), knowledge: (q) => content.knowledgeFor(q.chapter),
      titles: content.knowledgeTitles(), histories: await db.historiesFor(DB, uid, nums),
    }));
  });

  app.get("/bank", async (c) => {
    const state = await loadState(c.env.DB, c.get("user").id, content);
    const groups: [string, [stats.ChapterProgress, stats.Distribution][]][] = [];
    for (const p of stats.chapterProgress(content, state.cards, state.excluded)) {
      if (!groups.length || groups[groups.length - 1][0] !== p.group) groups.push([p.group, []]);
      groups[groups.length - 1][1].push(
        [p, stats.masteryDistribution(content.inChapter(p.code).map((q) => q.num).filter((n) => state.active.has(n)), state.cards)]);
    }
    return c.html(bankPage(meta, groups));
  });

  app.get("/bank/search", async (c) => {
    const q = c.req.query("q") ?? "";
    const term = q.trim().replace(/^#/, "");
    const num = parseLabel(term);
    if (num !== null && content.questions.has(num)) return c.redirect(`/q/${num}`, 303);
    const found = term
      ? content.all().filter((x) => x.source_full.includes(term) || x.source.includes(term) || x.kp.includes(term) || x.section.includes(term)
        || (content.text(x.num)?.search.includes(term) ?? false))
      : [];
    return c.html(searchPage(meta, q, found, await loadState(c.env.DB, c.get("user").id, content), content.texts));
  });

  app.get("/bank/:code", async (c) => {
    const code = c.req.param("code");
    if (!content.hasChapter(code)) return c.notFound();
    const uid = c.get("user").id;
    const [state, gradedToday] = await Promise.all([loadState(c.env.DB, uid, content), db.gradedOn(c.env.DB, uid, today())]);
    const kps = drillKps(content, code, state.status);
    const asked = intOrNull(c.req.query("kp"));
    const current = kps[(asked !== null && asked >= 1 && asked <= kps.length ? asked : defaultKp(kps)) - 1];
    const nums = current.questions.map((q) => q.num);
    const codes = content.chapters.map((ch) => ch.code);
    const at = codes.indexOf(code);
    const prev: [string, string] | null = current.index > 1 ? ["上一节", `/bank/${code}?kp=${current.index - 1}`]
      : at > 0 ? ["上一章", `/bank/${codes[at - 1]}?kp=${drillKps(content, codes[at - 1], state.status).length}`] : null;
    const following: [string, string] | null = current.index < kps.length ? ["下一节", `/bank/${code}?kp=${current.index + 1}`]
      : at + 1 < codes.length ? ["下一章", `/bank/${codes[at + 1]}?kp=1`] : null;
    return c.html(chapterPage(meta, {
      chapter: content.chapter(code), chapters: content.chapters, tree: kpTree(kps), current, prev, following, state,
      texts: content.texts, gradedToday,
      sections: new Map(nums.map((n) => [n, content.sectionsFor(n)])), knowledge: content.knowledgeFor(code), titles: content.knowledgeTitles(),
      histories: await db.historiesFor(c.env.DB, uid, nums),
    }));
  });

  app.post("/bank/exclude", async (c) => {
    const form = await c.req.parseBody();
    const targets = numList(form.nums).filter((n) => content.questions.has(n));
    const kp = str(form.kp);
    const chapter = str(form.chapter);
    const section = str(form.section);
    if (kp) {
      targets.push(...content.all()
        .filter((q) => q.kp === kp && (!chapter || q.chapter === chapter) && (!section || q.section === section))
        .map((q) => q.num));
    }
    await db.setExcluded(c.env.DB, c.get("user").id, targets, str(form.excluded) === "1");
    return c.redirect(safeBack(str(form.back), "/bank"), 303);
  });

  // Grade a question from the chapter page or a review page. Grading it again the same study day changes that day's grade.
  app.post("/q/:num/grade", async (c) => {
    const num = intOrNull(c.req.param("num"));
    const q = num === null ? undefined : content.questions.get(num);
    if (!q) return c.notFound();
    const form = await c.req.parseBody();
    const grade = str(form.grade);
    const mode = str(form.mode);
    if (isGrade(grade)) {
      await db.recordReview(c.env.DB, c.get("user").id, { num: q.num, grade, at: now(), mode: isReviewMode(mode) ? mode : "browse" });
    }
    return c.redirect(safeBack(str(form.back), `/bank/${q.chapter}#q-${q.num}`), 303);
  });

  app.get("/q/:num", async (c) => {
    const DB = c.env.DB;
    const uid = c.get("user").id;
    const num = intOrNull(c.req.param("num"));
    const q = num === null ? undefined : content.questions.get(num);
    if (!q) return c.notFound();
    const [state, history] = await Promise.all([loadState(DB, uid, content), db.historyFor(DB, uid, q.num)]);
    const [prev, next] = content.neighbors(q.num);
    return c.html(questionPage(meta, {
      q, chapter: content.chapter(q.chapter), card: state.cards.get(q.num), status: state.status(q.num), history,
      knowledge: content.knowledgeFor(q.chapter), sections: content.sectionsFor(q.num), titles: content.knowledgeTitles(),
      text: content.text(q.num),
      prev, next,
      kpIndex: drillKps(content, q.chapter, state.status).find((k) => k.questions.includes(q))!.index,
    }));
  });

  app.get("/knowledge", (c) => {
    const groups = new Map<string, KnowledgeEntry[]>();
    for (const entry of content.knowledge) {
      if (!groups.has(entry.group)) groups.set(entry.group, []);
      groups.get(entry.group)!.push(entry);
    }
    return c.html(knowledgeIndexPage(meta, [...groups], (slug) => slug in knowledge.chapters, knowledge.overview));
  });

  app.get("/knowledge/:slug", async (c) => {
    const slug = c.req.param("slug");
    // The 线代 mind map used to be one page; it is now one per chapter, 10–15.
    if (slug === "xiandai" && content.knowledgeEntry("10")) return c.redirect("/knowledge/10", 303);
    const entry = content.knowledgeEntry(slug);
    if (!entry) return c.notFound();
    const text = knowledge.chapters[slug];
    const tab = c.req.query("tab") === "text" && text ? "text" : "original";
    const state = await loadState(c.env.DB, c.get("user").id, content);
    const chapters = content.chapters.filter((ch) => (content.chapterLinks[ch.code] ?? []).includes(slug));
    return c.html(knowledgePage(meta, {
      entry, tab, chapters, state,
      text: text && { html: injectSectionQuestions(text.html, slug, content, state), toc: text.toc },
      pageQuestions: entry.pages.map((_, i) => content.questionsOnPage(slug, i + 1)),
    }));
  });

  app.get("/history", async (c) => {
    const reviews = (await db.reviewLog(c.env.DB, c.get("user").id, addDays(today(), -60))).reverse();
    const days: HistoryDay[] = [];
    for (const r of reviews) {
      let last = days[days.length - 1];
      if (!last || last.day !== r.studyDay) {
        last = { day: r.studyDay, items: [], count: 0 };
        days.push(last);
      }
      last.items.push(r);
    }
    for (const d of days) d.count = new Set(d.items.map((r) => r.num)).size;
    return c.html(historyPage(meta, days, content.questions));
  });

  app.get("/settings", async (c) => {
    const DB = c.env.DB;
    const { id: uid, name } = c.get("user");
    const [exam, warmup] = await Promise.all([examDate(DB, uid), warmupDays(DB, uid)]);
    return c.html(settingsPage(meta, {
      examDate: exam, warmupDays: warmup, saved: c.req.query("saved") === "1", builtAt: content.builtAt, userName: name,
    }));
  });

  app.post("/settings", async (c) => {
    const DB = c.env.DB;
    const uid = c.get("user").id;
    const form = await c.req.parseBody();
    const exam = str(form.exam_date);
    if (/^\d{4}-\d{2}-\d{2}$/.test(exam) && !Number.isNaN(Date.parse(exam))) await db.setSetting(DB, uid, "exam_date", exam);
    const warmup = intOrNull(form.warmup_days);
    if (warmup !== null && warmup >= 1 && warmup <= 7) await db.setSetting(DB, uid, "warmup_days", String(warmup));
    return c.redirect("/settings?saved=1", 303);
  });

  app.get("/settings/export", async (c) => {
    const dump = await db.exportAll(c.env.DB, c.get("user").id, now());
    return new Response(JSON.stringify(dump, null, 1), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="dgy-backup-${today()}.json"`,
      },
    });
  });
}
