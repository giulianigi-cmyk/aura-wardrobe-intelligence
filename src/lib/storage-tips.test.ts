import test from "node:test";
import assert from "node:assert/strict";
import { FOLD_DIAGRAMS, STORAGE_TIPS_LANGUAGES, storageTipsFor } from "./storage-tips";

test("every language has the same sections, none empty", () => {
  const ids = storageTipsFor("it").sections.map((s) => s.id);
  for (const lang of STORAGE_TIPS_LANGUAGES) {
    const tips = storageTipsFor(lang);
    assert.deepEqual(tips.sections.map((s) => s.id), ids, lang);
    assert.ok(tips.title.trim() && tips.intro.trim(), lang);
    for (const s of tips.sections) {
      assert.ok(s.title.trim(), `${lang} ${s.id}`);
      assert.ok(s.tips.length > 0 && s.tips.every((t) => t.trim().length > 0), `${lang} ${s.id}`);
    }
  }
});

test("regional and unknown languages fall back sensibly", () => {
  assert.equal(storageTipsFor("it-IT").title, storageTipsFor("it").title);
  assert.equal(storageTipsFor("de").title, storageTipsFor("en").title);
  assert.equal(storageTipsFor(undefined).title, storageTipsFor("en").title);
});

test("the folding drawings sit under knitwear, shirts, trousers and rolled T-shirts in every language", () => {
  // The drawings are matched to the first tips of the "fold" section by position.
  const markers: Record<string, string[]> = {
    it: ["Maglion", "Camicie", "Pantaloni", "T-shirt"],
    en: ["Knitwear", "Shirts", "Trousers", "T-shirts"],
    fr: ["Pulls", "Chemises", "Pantalons", "T-shirts"],
    es: ["Jerséis", "Camisas", "Pantalones", "Camisetas"],
    zh: ["毛衣", "衬衫", "长裤", "T 恤"],
  };
  for (const lang of STORAGE_TIPS_LANGUAGES) {
    const fold = storageTipsFor(lang).sections.find((s) => s.id === "fold")!;
    assert.ok(fold.tips.length >= FOLD_DIAGRAMS.length, lang);
    markers[lang].forEach((m, i) => assert.ok(fold.tips[i].startsWith(m), `${lang} ${i}`));
  }
});
