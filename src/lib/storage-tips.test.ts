import test from "node:test";
import assert from "node:assert/strict";
import { FOLD_DIAGRAMS, STORAGE_TIPS_LANGUAGES, foldDiagramsFor, storageTipsFor } from "./storage-tips";

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

test("every drawing has a caption in every language; bras for women, boxers for men", () => {
  for (const lang of STORAGE_TIPS_LANGUAGES) {
    const tips = storageTipsFor(lang);
    for (const k of FOLD_DIAGRAMS) assert.ok(tips.diagramLabels[k]?.trim(), `${lang} ${k}`);
    for (const k of FOLD_DIAGRAMS) assert.ok(tips.diagramSteps[k]?.length === 3 && tips.diagramSteps[k].every((x) => x.trim()), `${lang} ${k} steps`);
    assert.ok(tips.diagramsTitle.trim(), lang);
  }
  assert.ok(!foldDiagramsFor("Man").includes("bra") && foldDiagramsFor("Man").includes("boxers"));
  assert.ok(!foldDiagramsFor("Woman").includes("boxers") && foldDiagramsFor("Woman").includes("bra"));
  assert.deepEqual(foldDiagramsFor(null), [...FOLD_DIAGRAMS]);
});
