import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Content, sectionLabel, type Linking } from "../src/content";
import { TEXTS, smallBank } from "./fixtures";
import { setup } from "./harness";

const LINKING: Linking = {
  sections: [
    { key: "01/1", slug: "01", number: "1", level: 2, title: "函数基础", anchor: "1-函数基础", pdf_page: 10, page_index: 1, parent: null },
    { key: "01/1.1", slug: "01", number: "1.1", level: 3, title: "有界与 $n$ 次根式", anchor: "11-有界", pdf_page: 10, page_index: 1, parent: "01/1" },
    { key: "01/2", slug: "01", number: "2", level: 2, title: "数列极限", anchor: "2-数列极限", pdf_page: 11, page_index: 2, parent: null },
  ],
  links: { "3": ["01/2", "01/1.1"], "1": ["01/1.1", "99/9"], "99": ["01/1"] },
};

describe("knowledge sections", () => {
  it("map questions to sections and back, like dgy/content.py", () => {
    const content = new Content(smallBank(), LINKING);
    expect(content.sectionsFor(3).map((s) => s.key)).toEqual(["01/2", "01/1.1"]);
    expect(content.sectionsFor(1).map((s) => s.key)).toEqual(["01/1.1"]); // unknown sections are dropped
    expect(content.sectionsFor(2)).toEqual([]);
    expect(content.questionsFor("01/1.1")).toEqual([1, 3]);
    expect(content.questionsFor("01/1")).toEqual([]); // #099 is not in the question bank
    expect(content.questionsOnPage("01", 1)).toEqual([1, 3]);
    expect(content.questionsOnPage("01", 2)).toEqual([3]);
    expect(content.knowledgeTitles()["01"]).toBe("函数、极限与连续");
  });

  it("label a section without the math dollars", () => {
    expect(sectionLabel(LINKING.sections[1])).toBe("1.1 有界与 n 次根式");
  });
});

describe("question text", () => {
  it("is looked up by number and dropped for questions not in the bank", () => {
    const content = new Content(smallBank(), undefined, { ...TEXTS, "999": TEXTS["1"] });
    expect(content.text(1)?.answer_key).toBe("C");
    expect(content.text(4)).toBeUndefined();
    expect(content.texts.has(999)).toBe(false);
  });
});

describe("theme and question size markup", () => {
  it("is the same as the Python templates'", async () => {
    const { client } = setup();
    await client.login();
    const page = await (await client.get("/")).text();
    for (const name of ["_theme_head.html", "_qsize_toggle.html", "_theme_toggle.html"]) {
      const snippet = readFileSync(new URL(`../../dgy/templates/${name}`, import.meta.url), "utf8").trim();
      expect(page).toContain(snippet);
    }
  });
});

describe("the 考点 tree's position script", () => {
  it("is the same as the Python template's", async () => {
    const { client } = setup();
    await client.login();
    const page = await (await client.get("/bank/A?kp=1")).text();
    const snippet = readFileSync(new URL("../../dgy/templates/_tree_scroll.html", import.meta.url), "utf8").trim();
    expect(page).toContain(snippet);
  });
});
