// Run with: bun test src/lib/guide/guide.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GUIDE, GUIDE_LANGUAGES, searchGuide, type GuideText, type GuideVisual } from "./guide-structure";
import it from "./guide-text.it";
import en from "./guide-text.en";
import es from "./guide-text.es";
import fr from "./guide-text.fr";

const texts: Record<string, GuideText> = { it, en, es, fr };
const articles = GUIDE.flatMap((c) => c.articles);

test("every language has every chapter and article, with one sentence per step", () => {
  for (const lang of GUIDE_LANGUAGES) {
    const text = texts[lang];
    assert.deepEqual(Object.keys(text.chapters).sort(), GUIDE.map((c) => c.id).sort(), lang);
    assert.deepEqual(Object.keys(text.articles).sort(), articles.map((a) => a.id).sort(), lang);
    for (const a of articles) {
      assert.equal(text.articles[a.id].steps.length, a.visuals.length, `${lang} ${a.id}`);
      for (const s of text.articles[a.id].steps) assert.ok(s.trim().length > 0, `${lang} ${a.id}`);
    }
  }
});

test("every label drawn in the Guide exists in all four app languages", () => {
  const locales = GUIDE_LANGUAGES.map((l) => [l, JSON.parse(readFileSync(new URL(`../../i18n/locales/${l}.json`, import.meta.url), "utf8"))] as const);
  const keysOf = (v: GuideVisual): string[] =>
    v.kind === "tab" ? [`tabBar.${{ home: "home", wardrobe: "closet", ai: "stylist", planner: "calendar", profile: "you" }[v.tab]}`]
    : v.kind === "chips" ? v.labelKeys
    : [v.labelKey, ...("subKey" in v && v.subKey ? [v.subKey] : []), ...("hintKey" in v && v.hintKey ? [v.hintKey] : [])];
  for (const a of articles) {
    for (const v of a.visuals) {
      if (!v) continue;
      for (const key of keysOf(v)) {
        for (const [lang, dict] of locales) {
          const value = key.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), dict);
          assert.equal(typeof value, "string", `${lang}: ${key} (${a.id})`);
        }
      }
    }
  }
});

test("search matches words across title and steps, ignoring accents and case", () => {
  assert.ok(searchGuide(it, "valigia").includes("trips"));
  assert.ok(searchGuide(fr, "DÉTOURE").includes("first-pieces"));
  assert.ok(searchGuide(en, "avatar photo").includes("create-avatar"));
  assert.deepEqual(searchGuide(it, "   "), []);
  assert.deepEqual(searchGuide(it, "zzzz"), []);
});
