// Run with: bun test src/lib/laundry-care.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { careExtrasFor, careProfileFor, laundryTextFor, LAUNDRY_LANGUAGES, PROFILE_SYMBOLS, SYMBOL_GROUPS } from "./laundry-care";

test("a mix is washed like its most delicate fibre", () => {
  assert.equal(careProfileFor(["Cotton", "Elastane"]), "synthetic");
  assert.equal(careProfileFor(["Wool", "Polyamide"]), "wool");
  assert.equal(careProfileFor(["Silk", "Viscose"]), "silk");
  assert.equal(careProfileFor(["Cotton"]), "cotton");
  assert.equal(careProfileFor(["Linen", "Cotton"]), "linen");
  assert.equal(careProfileFor(["Denim", "Cotton"]), "denim");
});

test("leather, metal and accessories are never sent to the washing machine", () => {
  assert.equal(careProfileFor(["Cotton", "Leather"]), "leather");
  assert.equal(careProfileFor(["Suede"], "Shoes"), "leatherShoes");
  assert.equal(careProfileFor(["Leather"], "Shoes"), "leatherShoes");
  assert.equal(careProfileFor(["Patent Leather"], "Shoes"), "patent");
  assert.equal(careProfileFor(["Patent Leather", "Leather"], "Bags"), "patent");
  assert.ok(PROFILE_SYMBOLS.patent.includes("wash-no"));
  assert.equal(careProfileFor(["Calf Hair", "Leather"], "Shoes"), "calfHair");
  assert.ok(!PROFILE_SYMBOLS.leather.includes("dryclean-P"));
  assert.equal(careProfileFor(["Gold", "Diamonds"], "Accessories"), "hard");
  assert.equal(careProfileFor(["Silver"]), "hard");
  assert.equal(careProfileFor(["Canvas"], "Shoes"), "shoes");
  assert.equal(careProfileFor(["Cotton"], "Bags"), "bag");
  assert.ok(PROFILE_SYMBOLS.leather.includes("wash-no"));
  assert.ok(PROFILE_SYMBOLS.bag.includes("wash-no"));
});

test("decorations, swimwear and unknown pieces", () => {
  assert.equal(careProfileFor(["Polyester", "Sequins"]), "embellished");
  assert.equal(careProfileFor(["Polyamide", "Elastane"], "Swimwear"), "swim");
  assert.equal(careProfileFor([]), null);
  assert.equal(careProfileFor([], "Tops"), null);
});

test("extras for bras, activewear and hosiery", () => {
  assert.deepEqual(careExtrasFor("Underwear", "Bra"), ["bra"]);
  assert.deepEqual(careExtrasFor("Underwear", "Sports Bra"), ["bra", "activewear"]);
  assert.deepEqual(careExtrasFor("Activewear", "Training Top"), ["activewear"]);
  assert.deepEqual(careExtrasFor("Underwear", "Tights"), ["hosiery"]);
  assert.deepEqual(careExtrasFor("Tops", "Shirt"), []);
});

test("every language explains every symbol, profile and programme", () => {
  const symbols = SYMBOL_GROUPS.flatMap((g) => g.symbols);
  const en = laundryTextFor("en");
  for (const lang of LAUNDRY_LANGUAGES) {
    const text = laundryTextFor(lang);
    for (const s of symbols) assert.ok(text.symbolLabels[s]?.trim(), `${lang} ${s}`);
    for (const p of Object.keys(PROFILE_SYMBOLS) as (keyof typeof PROFILE_SYMBOLS)[]) {
      assert.ok(text.profiles[p].name.trim(), `${lang} ${p}`);
      assert.ok(text.profiles[p].lines.length > 0, `${lang} ${p}`);
    }
    assert.equal(text.programmes.length, en.programmes.length, lang);
    assert.equal(text.tips.length, en.tips.length, lang);
  }
  assert.equal(laundryTextFor("de").title, en.title);
  assert.equal(laundryTextFor("it-IT").title, "Guida al lavaggio");
});
